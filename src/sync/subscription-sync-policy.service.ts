import {
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import type {
  AuthUser,
} from "../common/auth-user";
import {
  PrismaService,
} from "../prisma/prisma.service";

export type EffectiveSyncPolicy =
  | "full"
  | "platform_only"
  | "disabled"
  | "read_only"
  | "developer";


export type FrontendSyncMode =
  | "full"
  | "hybrid"
  | "offline"
  | "developer"
  | "read_only";

export interface FrontendEffectiveSyncPolicy {
  accountId: string;
  mode: FrontendSyncMode;
  allowPush: boolean;
  allowPull: boolean;
  allowPlatformCache: boolean;
  allowDeviceRegistration: boolean;
  allowWorkspaceBootstrap: boolean;
  allowLocalMutations: boolean;
  reason: string;
  entitlementVersion?: number;
  resolvedAt: number;
  expiresAt?: number | null;
}

export interface ResolvedSyncAccess {
  accountId: string;
  syncPolicy: EffectiveSyncPolicy;
  configuredPolicy:
    | "full"
    | "platform_only"
    | "disabled";
  deploymentMode:
    | "connected"
    | "offline";
  status: string;
  source:
    | "entitlement"
    | "subscription"
    | "developer"
    | "legacy_fallback";
  canPush: boolean;
  canPull: boolean;
  canWorkspaceBootstrap: boolean;
  canPlatformCache: boolean;
  canRegisterDevice: boolean;
  canResolveConflicts: boolean;
  reason?: string;
  entitlementVersion?: number;
}

/**
 * Converts commercial access into one server-authoritative sync policy.
 *
 * Compatibility:
 * Accounts created before entitlement snapshots existed retain full sync unless
 * SYNC_ENTITLEMENT_ENFORCEMENT=strict. Remove the fallback after every account
 * has been reconciled by the entitlement engine.
 */
@Injectable()
export class SubscriptionSyncPolicyService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async resolve(input: {
    accountId: string;
    role?: string | null;
  }): Promise<ResolvedSyncAccess> {
    const accountId =
      String(input.accountId || "").trim();

    const role = String(
      input.role || "",
    )
      .trim()
      .toLowerCase()
      .replace(/-/g, "_");

    if (
      role === "developer" ||
      role === "platform_team"
    ) {
      return this.build({
        accountId,
        policy: "developer",
        configuredPolicy: "full",
        deploymentMode: "connected",
        status: "active",
        source: "developer",
      });
    }

    const entitlement =
      await this.prisma.accountEntitlement.findUnique({
        where: { accountId },
        select: {
          syncPolicy: true,
          deploymentMode: true,
          status: true,
          version: true,
        },
      });

    if (entitlement) {
      const configuredPolicy =
        this.normalizeConfiguredPolicy(
          entitlement.syncPolicy,
        );

      const status = String(
        entitlement.status || "active",
      ).toLowerCase();

      const effectivePolicy =
        this.isReadOnlyStatus(status)
          ? "read_only"
          : configuredPolicy;

      return this.build({
        accountId,
        policy: effectivePolicy,
        configuredPolicy,
        deploymentMode:
          this.normalizeDeploymentMode(
            entitlement.deploymentMode,
          ),
        status,
        source: "entitlement",
        entitlementVersion:
          entitlement.version,
      });
    }

    const subscription =
      await this.prisma.accountSubscription.findUnique({
        where: { accountId },
        select: {
          syncPolicy: true,
          deploymentMode: true,
          status: true,
          entitlementVersion: true,
        },
      });

    if (subscription) {
      const configuredPolicy =
        this.normalizeConfiguredPolicy(
          subscription.syncPolicy,
        );
      const status = String(
        subscription.status || "active",
      ).toLowerCase();

      return this.build({
        accountId,
        policy: this.isReadOnlyStatus(status)
          ? "read_only"
          : configuredPolicy,
        configuredPolicy,
        deploymentMode:
          this.normalizeDeploymentMode(
            subscription.deploymentMode,
          ),
        status,
        source: "subscription",
        entitlementVersion:
          subscription.entitlementVersion,
      });
    }

    const strict =
      String(
        process.env
          .SYNC_ENTITLEMENT_ENFORCEMENT ||
          "",
      ).toLowerCase() === "strict";

    return this.build({
      accountId,
      policy: strict
        ? "platform_only"
        : "full",
      configuredPolicy: strict
        ? "platform_only"
        : "full",
      deploymentMode: "connected",
      status: strict
        ? "unresolved"
        : "legacy",
      source: "legacy_fallback",
      reason: strict
        ? "No effective entitlement snapshot exists."
        : "Legacy compatibility remains enabled until entitlement reconciliation completes.",
    });
  }

  /**
   * Returns the exact execution contract consumed by the frontend
   * resolveSyncPolicy() function. The JWT account remains authoritative; the
   * browser-provided accountId is never trusted by the controller.
   */
  async resolveFrontendPolicy(input: {
    accountId: string;
    role?: string | null;
  }): Promise<FrontendEffectiveSyncPolicy> {
    const access = await this.resolve(input);
    const resolvedAt = Date.now();
    const ttlMs = Math.max(
      30_000,
      Number(
        process.env.SYNC_POLICY_CACHE_TTL_MS ||
          300_000,
      ) || 300_000,
    );

    const mode = this.toFrontendMode(access);

    return {
      accountId: access.accountId,
      mode,
      allowPush: access.canPush,
      allowPull: access.canPull,
      allowPlatformCache:
        access.canPlatformCache,
      allowDeviceRegistration:
        access.canRegisterDevice,
      allowWorkspaceBootstrap:
        access.canWorkspaceBootstrap,
      allowLocalMutations:
        mode !== "read_only",
      reason:
        access.reason ||
        `Effective synchronization policy: ${access.syncPolicy}.`,
      entitlementVersion:
        access.entitlementVersion,
      resolvedAt,
      expiresAt: resolvedAt + ttlMs,
    };
  }

  private toFrontendMode(
    access: ResolvedSyncAccess,
  ): FrontendSyncMode {
    if (access.syncPolicy === "developer") {
      return "developer";
    }

    if (access.syncPolicy === "read_only") {
      return "read_only";
    }

    if (
      access.syncPolicy === "disabled" ||
      access.deploymentMode === "offline"
    ) {
      return "offline";
    }

    if (access.syncPolicy === "platform_only") {
      return "hybrid";
    }

    return "full";
  }

  async assertCanPush(
    actor: AuthUser,
    accountId: string,
  ) {
    const access = await this.resolve({
      accountId,
      role: actor.role,
    });

    if (!access.canPush) {
      throw new ForbiddenException(
        this.denialMessage(
          "push school data",
          access,
        ),
      );
    }

    return access;
  }

  async assertCanPull(
    actor: AuthUser,
    accountId: string,
  ) {
    const access = await this.resolve({
      accountId,
      role: actor.role,
    });

    if (!access.canPull) {
      throw new ForbiddenException(
        this.denialMessage(
          "pull school data",
          access,
        ),
      );
    }

    return access;
  }

  async assertCanWorkspaceBootstrap(
    actor: AuthUser,
    accountId: string,
  ) {
    const access = await this.resolve({
      accountId,
      role: actor.role,
    });

    if (!access.canWorkspaceBootstrap) {
      throw new ForbiddenException(
        this.denialMessage(
          "download a workspace bootstrap",
          access,
        ),
      );
    }

    return access;
  }

  async assertCanPlatformCache(
    actor: AuthUser,
    accountId: string,
  ) {
    const access = await this.resolve({
      accountId,
      role: actor.role,
    });

    if (!access.canPlatformCache) {
      throw new ForbiddenException(
        this.denialMessage(
          "refresh platform access",
          access,
        ),
      );
    }

    return access;
  }

  async assertCanResolveConflicts(
    actor: AuthUser,
    accountId: string,
  ) {
    const access = await this.resolve({
      accountId,
      role: actor.role,
    });

    if (!access.canResolveConflicts) {
      throw new ForbiddenException(
        this.denialMessage(
          "resolve synchronization conflicts",
          access,
        ),
      );
    }

    return access;
  }

  private build(input: {
    accountId: string;
    policy: EffectiveSyncPolicy;
    configuredPolicy:
      | "full"
      | "platform_only"
      | "disabled";
    deploymentMode:
      | "connected"
      | "offline";
    status: string;
    source: ResolvedSyncAccess["source"];
    reason?: string;
    entitlementVersion?: number;
  }): ResolvedSyncAccess {
    const developer =
      input.policy === "developer";
    const full =
      input.policy === "full" ||
      developer;
    const readOnly =
      input.policy === "read_only";

    return {
      accountId: input.accountId,
      syncPolicy: input.policy,
      configuredPolicy:
        input.configuredPolicy,
      deploymentMode:
        input.deploymentMode,
      status: input.status,
      source: input.source,

      canPush: full,
      canPull: full || readOnly,
      canWorkspaceBootstrap:
        full || readOnly,
      canPlatformCache: true,
      canRegisterDevice: true,
      canResolveConflicts: full,

      reason: input.reason,
      entitlementVersion:
        input.entitlementVersion,
    };
  }

  private normalizeConfiguredPolicy(
    value?: string | null,
  ):
    | "full"
    | "platform_only"
    | "disabled" {
    const policy = String(
      value || "disabled",
    )
      .trim()
      .toLowerCase();

    if (policy === "full") {
      return "full";
    }

    if (
      policy === "platform_only" ||
      policy === "hybrid"
    ) {
      return "platform_only";
    }

    return "disabled";
  }

  private normalizeDeploymentMode(
    value?: string | null,
  ): "connected" | "offline" {
    return String(value || "")
      .toLowerCase() === "offline"
      ? "offline"
      : "connected";
  }

  private isReadOnlyStatus(
    status: string,
  ) {
    return [
      "past_due",
      "expired",
      "suspended",
      "cancelled",
      "read_only",
    ].includes(status);
  }

  private denialMessage(
    operation: string,
    access: ResolvedSyncAccess,
  ) {
    return [
      `This account cannot ${operation}.`,
      `Effective sync policy: ${access.syncPolicy}.`,
      access.reason,
    ]
      .filter(Boolean)
      .join(" ");
  }
}
