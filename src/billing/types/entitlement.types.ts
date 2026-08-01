/**
 * src/billing/types/entitlement.types.ts
 * --------------------------------------------------------------------------
 * Shared version-one entitlement contracts.
 *
 * An entitlement is the effective account-level access contract produced from
 * the active subscription, plan, private offer, pricing override or
 * complimentary/manual grant.
 */

import type {
  SubscriptionBillingCycle,
  SubscriptionStatus,
} from "./subscription.types";
import type {
  AccountUsage,
  MeteredResource,
  ResourceLimitMap,
  ResourceRemainingMap,
  ResourceUsageMap,
} from "./usage.types";

export const ENTITLEMENT_SCHEMA_VERSION = 1 as const;

export type EntitlementSource =
  | "subscription"
  | "trial"
  | "private_offer"
  | "pricing_override"
  | "complimentary"
  | "manual";

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
  | "schoolWebsites"
  | "communications"
  | "calendarScheduling"
  | "parentPortal"
  | "studentPortal"
  | "teacherPortal"
  | "advancedAnalytics"
  | "apiAccess"
  | "webhooks"
  | "prioritySupport"
  | string;

export type EntitlementFeatureFlags = Record<string, boolean>;

export interface EntitlementPlanSource {
  planId?: string | null;
  planCode?: string | null;
  planName?: string | null;
  billingCycle?: SubscriptionBillingCycle | null;
  subscriptionStatus?: SubscriptionStatus | null;
  subscriptionId?: string | null;
  privateOfferId?: string | null;
  pricingOverrideId?: string | null;
}

export interface AccountEntitlementRecord {
  id: string;
  accountId: string;
  planId?: string | null;

  source: EntitlementSource;
  status: EntitlementStatus;

  validFrom?: Date | null;
  validUntil?: Date | null;
  graceEndsAt?: Date | null;

  maxSchools?: number | null;
  maxBranches?: number | null;
  maxUsers?: number | null;
  maxStudents?: number | null;
  maxTeachers?: number | null;
  maxStorageMb?: number | null;
  maxApiCallsPerMonth?: number | null;

  featureFlags: EntitlementFeatureFlags;
  limitOverrides?: Partial<ResourceLimitMap> | null;
  sourceDetails?: EntitlementPlanSource | null;
  metadata?: Record<string, unknown> | null;

  version: number;
  schemaVersion: typeof ENTITLEMENT_SCHEMA_VERSION;

  rebuiltAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EffectiveEntitlement {
  accountId: string;
  source: EntitlementSource;
  status: EntitlementStatus;

  validFrom: Date | null;
  validUntil: Date | null;
  graceEndsAt: Date | null;

  features: EntitlementFeatureFlags;
  limits: ResourceLimitMap;

  version: number;
  schemaVersion: typeof ENTITLEMENT_SCHEMA_VERSION;

  sourceDetails: EntitlementPlanSource;
  metadata?: Record<string, unknown> | null;
}

export interface SubscriptionAccessSnapshot {
  accountId: string;

  status: EntitlementStatus;
  source: EntitlementSource;

  validFrom: string | null;
  validUntil: string | null;
  graceEndsAt: string | null;

  features: EntitlementFeatureFlags;
  limits: ResourceLimitMap;
  usage: ResourceUsageMap;
  remaining: ResourceRemainingMap;

  entitlementVersion: number;
  usageCalculatedAt: string | null;

  sourceDetails?: EntitlementPlanSource;
}

export type EntitlementDecisionCode =
  | "ALLOWED"
  | "SUBSCRIPTION_INACTIVE"
  | "SUBSCRIPTION_EXPIRED"
  | "SUBSCRIPTION_SUSPENDED"
  | "FEATURE_DISABLED"
  | "RESOURCE_LIMIT_REACHED"
  | "RESOURCE_LIMIT_EXCEEDED"
  | "USAGE_SNAPSHOT_UNAVAILABLE";

export interface EntitlementDecision {
  allowed: boolean;
  code: EntitlementDecisionCode;
  message?: string;

  accountId: string;
  feature?: EntitlementFeatureKey;
  resource?: MeteredResource;

  currentUsage?: number;
  limit?: number | null;
  remaining?: number | null;
  requestedIncrease?: number;

  validUntil?: Date | null;
  graceEndsAt?: Date | null;

  upgradeRequired?: boolean;
  entitlementVersion?: number;
}

export interface EntitlementBuildInput {
  accountId: string;
  now?: Date;

  basePlan?: {
    id: string;
    code: string;
    name: string;
    featureFlags: EntitlementFeatureFlags;
    limits: ResourceLimitMap;
  } | null;

  source: EntitlementSource;
  status: EntitlementStatus;

  validFrom?: Date | null;
  validUntil?: Date | null;
  graceEndsAt?: Date | null;

  privateOfferFeatureOverrides?: EntitlementFeatureFlags | null;
  privateOfferLimitOverrides?: Partial<ResourceLimitMap> | null;

  accountFeatureOverrides?: EntitlementFeatureFlags | null;
  accountLimitOverrides?: Partial<ResourceLimitMap> | null;

  sourceDetails?: EntitlementPlanSource;
  metadata?: Record<string, unknown> | null;
}

export interface EntitlementBuildResult {
  entitlement: EffectiveEntitlement;
  changed: boolean;
  previousVersion?: number | null;
  nextVersion: number;
}

export interface EntitlementAccessContext {
  entitlement: EffectiveEntitlement;
  usage?: AccountUsage | null;
  now?: Date;
}
