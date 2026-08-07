import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";

import { LicenseCryptoService } from "./license-crypto.service";
import { LicensePolicyService } from "./license-policy.service";
import type { CreatePerpetualLicenseDto } from "./dto/create-perpetual-license.dto";

@Injectable()
export class PerpetualLicenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: LicenseCryptoService,
    private readonly policy: LicensePolicyService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async issue(
    dto: CreatePerpetualLicenseDto,
    createdByUserId?: string,
  ) {
    const plan =
      await this.prisma.subscriptionPlan.findUnique({
        where: { id: dto.planId },
      });

    if (!plan || !plan.active) {
      throw new NotFoundException(
        "Commercial plan not found or inactive.",
      );
    }

    const existingActive =
      await this.prisma.perpetualLicense.findFirst({
        where: {
          accountId: dto.accountId,
          status: {
            in: ["pending", "active"],
          },
        },
      });

    if (existingActive) {
      throw new ConflictException(
        "The account already has a pending or active perpetual licence.",
      );
    }

    const licenseKey =
      this.crypto.generateLicenseKey();

    const purchasedAt = new Date();
    const validationIntervalDays =
      dto.validationIntervalDays ??
      plan.validationIntervalDays ??
      null;

    const nextValidationAt =
      dto.requiresPeriodicValidation ??
      plan.requiresPeriodicValidation
        ? this.policy.nextValidationAt(
            purchasedAt,
            validationIntervalDays,
          )
        : null;

    const entitledVersion =
      dto.entitledVersion ??
      dto.purchasedVersion;

    const license =
      await this.prisma.$transaction(
        async (tx) => {
          const created =
            await tx.perpetualLicense.create({
              data: {
                accountId: dto.accountId,
                planId: dto.planId,

                licenseKeyHash:
                  this.crypto.hash(licenseKey),
                licenseKeyPrefix:
                  licenseKey.slice(0, 12),

                status: "active",

                purchasedVersion:
                  dto.purchasedVersion,
                entitledVersion,
                licensedMajorVersion:
                  dto.licensedMajorVersion ??
                  plan.licensedMajorVersion,

                maxSchools:
                  dto.maxSchools ??
                  plan.maxSchools,
                maxBranches:
                  dto.maxBranches ??
                  plan.maxBranches,
                maxUsers:
                  dto.maxUsers ??
                  plan.maxUsers,
                maxStudents:
                  dto.maxStudents ??
                  plan.maxStudents,
                maxTeachers:
                  dto.maxTeachers ??
                  plan.maxTeachers,

                deviceLimit:
                  dto.deviceLimit ??
                  plan.deviceLimit,
                activationLimit:
                  dto.activationLimit ??
                  plan.activationLimit,

                syncPolicy:
                  dto.syncPolicy ??
                  "platform_only",
                updatePolicy:
                  dto.updatePolicy ??
                  "version_locked",

                requiresPeriodicValidation:
                  dto.requiresPeriodicValidation ??
                  plan.requiresPeriodicValidation,

                validationIntervalDays,
                offlineGraceDays:
                  dto.offlineGraceDays ??
                  plan.offlineGraceDays,

                lastValidatedAt: purchasedAt,
                nextValidationAt,

                currency:
                  dto.currency?.trim().toUpperCase() ??
                  plan.currency,
                listAmount: dto.listAmount,
                discountAmount:
                  dto.discountAmount ?? 0,
                amountPaid: dto.amountPaid,

                purchasedAt,
                activatedAt: purchasedAt,

                privateOfferId:
                  dto.privateOfferId,
                pricingOverrideId:
                  dto.pricingOverrideId,
                createdByUserId,

                metadata:
                  dto.metadata as Prisma.InputJsonValue,
              },
            });

          await tx.licenseVersionEntitlement.create({
            data: {
              accountId: dto.accountId,
              licenseId: created.id,
              planId: dto.planId,
              version: entitledVersion,
              majorVersion:
                dto.licensedMajorVersion ??
                plan.licensedMajorVersion,
              minimumAppVersion:
                plan.minimumAppVersion,
              maximumAppVersion:
                plan.maximumAppVersion,
              status: "active",
              metadata: {
                source: "initial_purchase",
              },
            },
          });

          return created;
        },
      );

    await this.entitlements.rebuild(
      dto.accountId,
    );

    return {
      license,
      /**
       * This is the only response that includes the raw licence key.
       * Store or display it securely; only its hash is stored in PostgreSQL.
       */
      licenseKey,
    };
  }

  async getForAccount(accountId: string) {
    return this.prisma.perpetualLicense.findMany({
      where: { accountId },
      include: {
        plan: true,
        activations: true,
        devices: true,
        versionEntitlements: true,
        upgradeOffers: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async suspend(
    licenseId: string,
    reason?: string,
  ) {
    const license =
      await this.prisma.perpetualLicense.update({
        where: { id: licenseId },
        data: {
          status: "suspended",
          suspendedAt: new Date(),
          metadata: reason
            ? { suspensionReason: reason }
            : undefined,
        },
      });

    await this.entitlements.rebuild(
      license.accountId,
    );

    return license;
  }

  async revoke(
    licenseId: string,
    reason?: string,
  ) {
    const license =
      await this.prisma.$transaction(
        async (tx) => {
          const updated =
            await tx.perpetualLicense.update({
              where: { id: licenseId },
              data: {
                status: "revoked",
                revokedAt: new Date(),
                metadata: reason
                  ? { revocationReason: reason }
                  : undefined,
              },
            });

          await tx.licenseActivation.updateMany({
            where: {
              licenseId,
              status: "active",
            },
            data: {
              status: "revoked",
              revokedAt: new Date(),
            },
          });

          await tx.licenseDevice.updateMany({
            where: {
              licenseId,
              status: "active",
            },
            data: {
              status: "revoked",
              revokedAt: new Date(),
            },
          });

          return updated;
        },
      );

    await this.entitlements.rebuild(
      license.accountId,
    );

    return license;
  }
}
