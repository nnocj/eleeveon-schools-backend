export type EffectiveAccessSource =
  | "subscription"
  | "perpetual_license"
  | "trial"
  | "private_offer"
  | "developer_override";

export type LicenseModel =
  | "subscription"
  | "perpetual"
  | "trial"
  | "complimentary";

export type DeploymentMode = "connected" | "offline";

export type SyncPolicy =
  | "full"
  | "platform_only"
  | "disabled";

export type UpdatePolicy =
  | "continuous"
  | "security_only"
  | "version_locked";

export type EntitlementStatus =
  | "active"
  | "trial"
  | "grace"
  | "past_due"
  | "expired"
  | "suspended"
  | "cancelled";

export type EntitlementFeatureKey =
  | "offlineSync"
  | "cloudBackup"
  | "reports"
  | "finance"
  | "attendance"
  | "identityCards"
  | "identitySafety"
  | "transport"
  | "communications"
  | "calendarScheduling"
  | "schoolWebsites"
  | "parentPortal"
  | "studentPortal"
  | "teacherPortal"
  | "advancedAnalytics"
  | "advancedScheduling"
  | "apiAccess"
  | "webhooks"
  | "prioritySupport"
  | string;

export type EntitlementResourceKey =
  | "schools"
  | "branches"
  | "users"
  | "students"
  | "teachers"
  | "storageMb"
  | "apiCallsPerMonth"
  | "devices"
  | "activations"
  | string;

export interface EntitlementLimits {
  schools?: number | null;
  branches?: number | null;
  users?: number | null;
  students?: number | null;
  teachers?: number | null;
  storageMb?: number | null;
  apiCallsPerMonth?: number | null;
  devices?: number | null;
  activations?: number | null;
  [key: string]: number | null | undefined;
}

export interface EntitlementUsage {
  schools: number;
  branches: number;
  users: number;
  students: number;
  teachers: number;
  storageMb: number;
  apiCallsPerMonth: number;
  devices?: number;
  activations?: number;
  calculatedAt?: Date;
}

export interface EffectiveAccessSnapshot {
  accountId: string;
  entitlementId?: string;

  source: EffectiveAccessSource;
  status: EntitlementStatus;

  planId?: string | null;
  subscriptionId?: string | null;
  perpetualLicenseId?: string | null;

  licenseModel: LicenseModel;
  deploymentMode: DeploymentMode;
  syncPolicy: SyncPolicy;
  updatePolicy: UpdatePolicy;

  entitledVersion?: string | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  graceEndsAt?: Date | null;

  features: Record<string, boolean>;
  limits: EntitlementLimits;

  version: number;
  schemaVersion: number;
  rebuiltAt: Date;

  sourceDetails?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface EffectiveAccess {
  snapshot: EffectiveAccessSnapshot;
  usage?: EntitlementUsage;

  can(feature: EntitlementFeatureKey): boolean;
  limit(resource: EntitlementResourceKey): number | null;
  used(resource: EntitlementResourceKey): number;
  remaining(resource: EntitlementResourceKey): number | null;
  hasCapacity(resource: EntitlementResourceKey, increase?: number): boolean;

  readonly syncPolicy: SyncPolicy;
  readonly updatePolicy: UpdatePolicy;
  readonly deploymentMode: DeploymentMode;
  readonly licenseModel: LicenseModel;
  readonly status: EntitlementStatus;
}
