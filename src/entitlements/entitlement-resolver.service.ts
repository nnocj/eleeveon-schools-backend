import { Injectable } from "@nestjs/common";
import { acquisitionOf, chooseCommercialBase, deploymentModeOf, syncPolicyOf, updatePolicyOf, statusAt } from "../commercial/deployment-policy";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementPolicyService } from "./entitlement-policy.service";
import type {
  DeploymentMode,
  EffectiveAccessSource,
  EffectiveAccessSnapshot,
  EntitlementLimits,
  EntitlementStatus,
  LicenseModel,
  SyncPolicy,
  UpdatePolicy,
} from "./types/entitlement.types";

type JsonObject = Record<string, unknown>;

@Injectable()
export class EntitlementResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: EntitlementPolicyService,
  ) {}

  async resolveSnapshot(
    accountId: string,
  ): Promise<EffectiveAccessSnapshot | null> {
    const entitlement =
      await this.prisma.accountEntitlement.findUnique({
        where: { accountId },
      });

    if (!entitlement) return null;

    return {
      accountId,
      entitlementId: entitlement.id,
      source: this.asSource(entitlement.source),
      status: statusAt({status: entitlement.status, validUntil: entitlement.validUntil, graceEndsAt: entitlement.graceEndsAt}),
      planId: entitlement.planId,
      subscriptionId: entitlement.subscriptionId,
      perpetualLicenseId:
        entitlement.perpetualLicenseId,
      licenseModel: this.asLicenseModel(
        entitlement.licenseModel,
      ),
      deploymentMode: this.asDeploymentMode(
        entitlement.deploymentMode,
      ),
      syncPolicy: this.asSyncPolicy(
        entitlement.syncPolicy,
      ),
      updatePolicy: this.asUpdatePolicy(
        entitlement.updatePolicy,
      ),
      entitledVersion: entitlement.entitledVersion,
      validFrom: entitlement.validFrom,
      validUntil: entitlement.validUntil,
      graceEndsAt: entitlement.graceEndsAt,
      features: this.policy.normalizeFeatures(
        entitlement.featureFlags,
      ),
      limits: this.buildLimits({
        maxSchools: entitlement.maxSchools,
        maxBranches: entitlement.maxBranches,
        maxUsers: entitlement.maxUsers,
        maxStudents: entitlement.maxStudents,
        maxTeachers: entitlement.maxTeachers,
        maxStorageMb: entitlement.maxStorageMb,
        maxApiCallsPerMonth:
          entitlement.maxApiCallsPerMonth,
        limitOverrides: entitlement.limitOverrides,
      }),
      version: entitlement.version,
      schemaVersion: entitlement.schemaVersion,
      rebuiltAt: entitlement.rebuiltAt,
      sourceDetails: this.asObject(
        entitlement.sourceDetails,
      ),
      metadata: this.asObject(entitlement.metadata),
    };
  }

  async rebuild(
    accountId: string,
    options?: {
      developerOverride?: {
        features?: Record<string, boolean>;
        limits?: Record<string, number | null>;
        validUntil?: Date | null;
      };
    },
  ): Promise<EffectiveAccessSnapshot | null> {
    const now = new Date();

    const [
      subscription,
      perpetualLicense,
      privateAssignment,
      pricingOverride,
      current,
    ] = await Promise.all([
      this.prisma.accountSubscription.findUnique({
        where: { accountId },
        include: { plan: true },
      }),
      this.prisma.perpetualLicense.findFirst({
        where: {
          accountId,
          status: "active",
        },
        include: {
          plan: true,
          versionEntitlements: {
            where: {
              status: "active",
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: now } },
              ],
            },
            orderBy: { grantedAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.privateOfferAssignment.findFirst({
        where: {
          accountId,
          status: {
            in: ["assigned", "active", "redeemed"],
          },
          OR: [
            { validFrom: null },
            { validFrom: { lte: now } },
          ],
          AND: [
            {
              OR: [
                { validUntil: null },
                { validUntil: { gt: now } },
              ],
            },
          ],
        },
        include: { offer: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.accountPricingOverride.findFirst({
        where: {
          accountId,
          active: true,
          OR: [
            { validFrom: null },
            { validFrom: { lte: now } },
          ],
          AND: [
            {
              OR: [
                { validUntil: null },
                { validUntil: { gt: now } },
              ],
            },
          ],
        },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.accountEntitlement.findUnique({
        where: { accountId },
      }),
    ]);

    const base = this.resolveBase(
      subscription,
      perpetualLicense,
      now,
    );

    if (!base) return null;

    let features = {
      ...base.features,
    };
    let limits = {
      ...base.limits,
    };
    let source = base.source;
    let validUntil = base.validUntil;
    const sourceDetails: JsonObject = {
      baseSource: base.source,
      acquisitionModel: base.licenseModel,
      sourcePlanId: base.planId,
      selectedPerpetualLicenseId: base.perpetualLicenseId,
      privateOfferAssignmentId:
        privateAssignment?.id,
      pricingOverrideId: pricingOverride?.id,
    };

    if (privateAssignment?.offer) {
      features = {
        ...features,
        ...this.booleanMap(
          privateAssignment.offer.featureOverrides,
        ),
      };

      limits = {
        ...limits,
        ...this.numberMap(
          privateAssignment.offer.limitOverrides,
        ),
      };

      source = "private_offer";
      validUntil =
        privateAssignment.validUntil ??
        privateAssignment.offer.validUntil ??
        validUntil;
    }

    if (pricingOverride) {
      features = {
        ...features,
        ...this.booleanMap(
          pricingOverride.featureOverrides,
        ),
      };

      limits = {
        ...limits,
        ...this.numberMap(
          pricingOverride.limitOverrides,
        ),
      };
    }

    if (options?.developerOverride) {
      features = {
        ...features,
        ...(options.developerOverride.features ?? {}),
      };
      limits = {
        ...limits,
        ...(options.developerOverride.limits ?? {}),
      };
      source = "developer_override";
      validUntil =
        options.developerOverride.validUntil ??
        validUntil;
    }

    const nextVersion =
      (current?.version ?? 0) + 1;

    const saved =
      await this.prisma.accountEntitlement.upsert({
        where: { accountId },
        update: {
          planId: base.planId,
          subscriptionId: base.subscriptionId,
          perpetualLicenseId:
            base.perpetualLicenseId,
          source,
          status: base.status,
          validFrom: base.validFrom,
          validUntil,
          graceEndsAt: base.graceEndsAt,
          licenseModel: base.licenseModel,
          deploymentMode:
            base.deploymentMode,
          syncPolicy: base.syncPolicy,
          updatePolicy: base.updatePolicy,
          entitledVersion:
            base.entitledVersion,
          maxSchools: limits.schools ?? null,
          maxBranches: limits.branches ?? null,
          maxUsers: limits.users ?? null,
          maxStudents: limits.students ?? null,
          maxTeachers: limits.teachers ?? null,
          maxStorageMb:
            limits.storageMb ?? null,
          maxApiCallsPerMonth:
            limits.apiCallsPerMonth ?? null,
          featureFlags:
            features as Prisma.InputJsonValue,
          limitOverrides:
            limits as Prisma.InputJsonValue,
          sourceDetails:
            sourceDetails as Prisma.InputJsonValue,
          version: nextVersion,
          rebuiltAt: now,
        },
        create: {
          accountId,
          planId: base.planId,
          subscriptionId: base.subscriptionId,
          perpetualLicenseId:
            base.perpetualLicenseId,
          source,
          status: base.status,
          validFrom: base.validFrom,
          validUntil,
          graceEndsAt: base.graceEndsAt,
          licenseModel: base.licenseModel,
          deploymentMode:
            base.deploymentMode,
          syncPolicy: base.syncPolicy,
          updatePolicy: base.updatePolicy,
          entitledVersion:
            base.entitledVersion,
          maxSchools: limits.schools ?? null,
          maxBranches: limits.branches ?? null,
          maxUsers: limits.users ?? null,
          maxStudents: limits.students ?? null,
          maxTeachers: limits.teachers ?? null,
          maxStorageMb:
            limits.storageMb ?? null,
          maxApiCallsPerMonth:
            limits.apiCallsPerMonth ?? null,
          featureFlags:
            features as Prisma.InputJsonValue,
          limitOverrides:
            limits as Prisma.InputJsonValue,
          sourceDetails:
            sourceDetails as Prisma.InputJsonValue,
          version: 1,
          rebuiltAt: now,
        },
      });

    return this.resolveSnapshot(saved.accountId);
  }

  private resolveBase(
    subscription: any,
    perpetualLicense: any,
    now: Date,
  ): EffectiveAccessSnapshot | null {
    const subscriptionValidUntil = subscription?.status === "trial"
      ? (subscription.trialEndsAt ?? subscription.currentPeriodEnd ?? null)
      : (subscription?.currentPeriodEnd ?? null);
    const selected = chooseCommercialBase({
      subscriptionStatus: subscription?.status,
      subscriptionValidUntil,
      subscriptionGraceEndsAt: subscription?.graceEndsAt,
      hasActivePerpetual: Boolean(perpetualLicense),
      at: now,
    });
    if (subscription && selected === "subscription") {
      const plan = subscription.plan;

      const acquisition = acquisitionOf(plan.licenseModel, subscription.status);
      return {
        accountId: subscription.accountId,
        source: acquisition === "trial" ? "trial" : "subscription",
        status: statusAt({status: subscription.status, validUntil: subscriptionValidUntil, graceEndsAt: subscription.graceEndsAt}, now),
        planId: plan.id,
        subscriptionId: subscription.id,
        perpetualLicenseId: null,
        licenseModel: acquisition === "complimentary" ? "complimentary" : acquisition === "trial" ? "trial" : "subscription",
        deploymentMode:
          this.asDeploymentMode(
            subscription.deploymentMode ??
              plan.deploymentMode,
          ),
        syncPolicy: this.asSyncPolicy(
          subscription.syncPolicy ??
            plan.syncPolicy,
        ),
        updatePolicy: this.asUpdatePolicy(
          subscription.updatePolicy ??
            plan.updatePolicy,
        ),
        entitledVersion:
          plan.maximumAppVersion ??
          plan.entitledVersion ??
          null,
        validFrom:
          subscription.currentPeriodStart ??
          subscription.trialStartedAt ??
          null,
        validUntil: subscriptionValidUntil,
        graceEndsAt:
          subscription.graceEndsAt ?? null,
        features: this.planFeatures(plan),
        limits: this.planLimits(plan),
        version:
          subscription.entitlementVersion ?? 1,
        schemaVersion: 1,
        rebuiltAt: now,
      };
    }

    if (perpetualLicense) {
      const versionEntitlement =
        perpetualLicense.versionEntitlements?.[0];

      return {
        accountId: perpetualLicense.accountId,
        source: "perpetual_license",
        status: "active",
        planId: perpetualLicense.planId,
        subscriptionId: null,
        perpetualLicenseId:
          perpetualLicense.id,
        licenseModel: "perpetual",
        deploymentMode: "offline",
        syncPolicy: this.asSyncPolicy(
          perpetualLicense.syncPolicy,
        ),
        updatePolicy: this.asUpdatePolicy(
          perpetualLicense.updatePolicy,
        ),
        entitledVersion:
          versionEntitlement?.version ??
          perpetualLicense.entitledVersion,
        validFrom:
          perpetualLicense.activatedAt ??
          perpetualLicense.purchasedAt ??
          perpetualLicense.createdAt,
        // Version update rights can expire; ownership of an outright licence does not.
        validUntil: null,
        graceEndsAt:
          perpetualLicense.nextValidationAt
            ? new Date(
                perpetualLicense.nextValidationAt.getTime() +
                  (perpetualLicense.offlineGraceDays ?? 0) *
                    86400000,
              )
            : null,
        features: this.planFeatures(
          perpetualLicense.plan,
        ),
        limits: {
          ...this.planLimits(
            perpetualLicense.plan,
          ),
          schools:
            perpetualLicense.maxSchools,
          branches:
            perpetualLicense.maxBranches,
          users: perpetualLicense.maxUsers,
          students:
            perpetualLicense.maxStudents,
          teachers:
            perpetualLicense.maxTeachers,
          devices:
            perpetualLicense.deviceLimit,
          activations:
            perpetualLicense.activationLimit,
        },
        version: 1,
        schemaVersion: 1,
        rebuiltAt: now,
      };
    }

    return null;
  }

  private planFeatures(
    plan: any,
  ): Record<string, boolean> {
    const explicit = {
      offlineSync: plan.offlineSync,
      cloudBackup: plan.cloudBackup,
      reports: plan.reports,
      finance: plan.finance,
      attendance: plan.attendance,
      identityCards: plan.identityCards,
      identitySafety: plan.identitySafety,
      transport: plan.transport,
      communications: plan.communications,
      calendarScheduling:
        plan.calendarScheduling,
      schoolWebsites: plan.schoolWebsites,
      parentPortal: plan.parentPortal,
      studentPortal: plan.studentPortal,
      teacherPortal: plan.teacherPortal,
      advancedAnalytics:
        plan.advancedAnalytics,
      advancedScheduling:
        plan.calendarScheduling,
      apiAccess: plan.apiAccess,
      webhooks: plan.webhooks,
      prioritySupport:
        plan.prioritySupport,
    };

    return this.policy.normalizeFeatures({
      ...explicit,
      ...this.booleanMap(plan.features),
      ...this.booleanMap(
        this.asObject(plan.metadata)
          ?.featureFlags,
      ),
    });
  }

  private planLimits(
    plan: any,
  ): EntitlementLimits {
    return {
      schools: plan.maxSchools ?? null,
      branches: plan.maxBranches ?? null,
      users: plan.maxUsers ?? null,
      students: plan.maxStudents ?? null,
      teachers: plan.maxTeachers ?? null,
      storageMb: plan.maxStorageMb ?? null,
      apiCallsPerMonth:
        plan.maxApiCallsPerMonth ?? null,
      devices: plan.deviceLimit ?? null,
      activations:
        plan.activationLimit ?? null,
    };
  }

  private buildLimits(input: {
    maxSchools: number | null;
    maxBranches: number | null;
    maxUsers: number | null;
    maxStudents: number | null;
    maxTeachers: number | null;
    maxStorageMb: number | null;
    maxApiCallsPerMonth: number | null;
    limitOverrides: unknown;
  }): EntitlementLimits {
    return {
      schools: input.maxSchools,
      branches: input.maxBranches,
      users: input.maxUsers,
      students: input.maxStudents,
      teachers: input.maxTeachers,
      storageMb: input.maxStorageMb,
      apiCallsPerMonth:
        input.maxApiCallsPerMonth,
      ...this.numberMap(input.limitOverrides),
    };
  }

  private booleanMap(
    value: unknown,
  ): Record<string, boolean> {
    if (!value || typeof value !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(
        value as Record<string, unknown>,
      ).filter(
        (
          entry,
        ): entry is [string, boolean] =>
          typeof entry[1] === "boolean",
      ),
    );
  }

  private numberMap(
    value: unknown,
  ): Record<string, number | null> {
    if (!value || typeof value !== "object") {
      return {};
    }

    const result: Record<
      string,
      number | null
    > = {};

    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (item === null) {
        result[key] = null;
      } else if (
        typeof item === "number" &&
        Number.isFinite(item)
      ) {
        result[key] = item;
      }
    }

    return result;
  }

  private asObject(
    value: unknown,
  ): JsonObject | undefined {
    return value &&
      typeof value === "object" &&
      !Array.isArray(value)
      ? (value as JsonObject)
      : undefined;
  }

  private asSource(
    value: string,
  ): EffectiveAccessSource {
    if (
      [
        "subscription",
        "perpetual_license",
        "trial",
        "private_offer",
        "developer_override",
      ].includes(value)
    ) {
      return value as EffectiveAccessSource;
    }

    return "subscription";
  }

  private asLicenseModel(
    value: string,
  ): LicenseModel {
    return [
      "subscription",
      "perpetual",
      "trial",
      "complimentary",
    ].includes(value)
      ? (value as LicenseModel)
      : "subscription";
  }

  private asDeploymentMode(
    value: string,
  ): DeploymentMode {
    return deploymentModeOf(value);
  }

  private asSyncPolicy(
    value: string,
  ): SyncPolicy {
    return syncPolicyOf(value);
  }

  private asUpdatePolicy(
    value: string,
  ): UpdatePolicy {
    return updatePolicyOf(value);
  }

  private asStatus(
    value: string,
  ): EntitlementStatus {
    return [
      "active",
      "trial",
      "grace",
      "past_due",
      "expired",
      "suspended",
      "cancelled",
    ].includes(value)
      ? (value as EntitlementStatus)
      : "expired";
  }
}
