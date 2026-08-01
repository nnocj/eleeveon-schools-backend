/**
 * src/billing/types/subscription.types.ts
 * --------------------------------------------------------------------------
 * Shared version-one subscription domain contracts.
 *
 * These types describe subscription state, billing cycles, change orders,
 * periods, renewal behaviour and scheduled plan changes.
 *
 * Important:
 * - backend services remain authoritative for dates, prices and proration;
 * - all newly introduced contracts remain on schema version one;
 * - string unions mirror the Prisma schema comments while remaining easy to
 *   extend without introducing Prisma enums.
 */

export const SUBSCRIPTION_SCHEMA_VERSION = 1 as const;
export const SUBSCRIPTION_CALCULATION_VERSION = 1 as const;

export type SubscriptionBillingCycle =
  | "monthly"
  | "termly"
  | "yearly"
  | "manual";

export type SubscriptionStatus =
  | "trial"
  | "active"
  | "grace"
  | "past_due"
  | "expired"
  | "cancelled"
  | "suspended";

export type SubscriptionPeriodStatus =
  | "scheduled"
  | "active"
  | "completed"
  | "cancelled"
  | "superseded";

export type SubscriptionChangeType =
  | "new"
  | "renewal"
  | "extension"
  | "upgrade"
  | "downgrade"
  | "complimentary"
  | "manual_change";

export type SubscriptionEffectiveMode =
  | "immediate"
  | "period_end";

export type SubscriptionChangeOrderStatus =
  | "quoted"
  | "payment_pending"
  | "paid"
  | "scheduled"
  | "applied"
  | "cancelled"
  | "expired"
  | "failed";

export type SubscriptionPeriodSourceType =
  | "purchase"
  | "renewal"
  | "extension"
  | "upgrade"
  | "downgrade"
  | "complimentary"
  | "trial"
  | "manual_adjustment";

export type ScheduledSubscriptionChangeType =
  | "downgrade"
  | "renewal"
  | "manual_change";

export interface SubscriptionPlanReference {
  id: string;
  code: string;
  name: string;
  currency: string;
  priceMonthly: number;
  priceTermly: number;
  priceYearly: number;
}

export interface SubscriptionPeriodRecord {
  id: string;
  accountId: string;
  subscriptionId: string;
  planId: string;
  billingCycle: SubscriptionBillingCycle;
  startsAt: Date;
  endsAt: Date;
  sourceType: SubscriptionPeriodSourceType;
  sourceId?: string | null;
  changeOrderId?: string | null;
  currency: string;
  listAmount: number;
  amountPaid: number;
  creditUsed: number;
  discountAmount: number;
  status: SubscriptionPeriodStatus;
  calculationVersion: typeof SUBSCRIPTION_CALCULATION_VERSION;
  schemaVersion: typeof SUBSCRIPTION_SCHEMA_VERSION;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduledSubscriptionChange {
  planId: string;
  billingCycle: SubscriptionBillingCycle;
  changeType: ScheduledSubscriptionChangeType;
  effectiveAt: Date;
}

export interface AccountSubscriptionRecord {
  id: string;
  accountId: string;
  planId: string;
  status: SubscriptionStatus;
  billingCycle: SubscriptionBillingCycle;

  trialStartedAt?: Date | null;
  trialEndsAt?: Date | null;

  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  nextBillingDate?: Date | null;

  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  graceEndsAt?: Date | null;

  scheduledPlanId?: string | null;
  scheduledBillingCycle?: SubscriptionBillingCycle | null;
  scheduledChangeAt?: Date | null;
  scheduledChangeType?: ScheduledSubscriptionChangeType | null;

  cancelledAt?: Date | null;
  cancelReason?: string | null;

  entitlementVersion: number;
  schemaVersion: typeof SUBSCRIPTION_SCHEMA_VERSION;
  metadata?: Record<string, unknown> | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionChangeOrderRecord {
  id: string;
  accountId: string;
  subscriptionId?: string | null;

  fromPlanId?: string | null;
  toPlanId: string;

  privateOfferId?: string | null;
  pricingOverrideId?: string | null;

  changeType: SubscriptionChangeType;
  billingCycle: SubscriptionBillingCycle;
  effectiveMode: SubscriptionEffectiveMode;
  effectiveAt: Date;

  oldPeriodStart?: Date | null;
  oldPeriodEnd?: Date | null;
  newPeriodStart: Date;
  newPeriodEnd: Date;

  currency: string;
  baseAmount: number;
  creditAmount: number;
  discountAmount: number;
  taxAmount: number;
  amountDue: number;

  calculation: Record<string, unknown>;
  calculationVersion: typeof SUBSCRIPTION_CALCULATION_VERSION;

  status: SubscriptionChangeOrderStatus;
  invoiceId?: string | null;
  paymentId?: string | null;

  quoteExpiresAt: Date;
  paidAt?: Date | null;
  appliedAt?: Date | null;
  cancelledAt?: Date | null;
  failureReason?: string | null;

  requestedByUserId?: string | null;
  appliedByUserId?: string | null;

  schemaVersion: typeof SUBSCRIPTION_SCHEMA_VERSION;
  metadata?: Record<string, unknown> | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionDateRange {
  startsAt: Date;
  endsAt: Date;
}

export interface SubscriptionCycleDefinition {
  cycle: SubscriptionBillingCycle;
  months: number | null;
  requiresExplicitEndDate: boolean;
}

export interface SubscriptionRenewalDecision {
  canRenew: boolean;
  canExtend: boolean;
  activeUntil?: Date | null;
  suggestedStartAt: Date;
  suggestedEndAt: Date;
  reason?: string | null;
}

export interface SubscriptionChangeRequest {
  accountId: string;
  toPlanId: string;
  billingCycle: SubscriptionBillingCycle;
  requestedChangeType?: SubscriptionChangeType;
  effectiveMode?: SubscriptionEffectiveMode;
  requestedByUserId?: string | null;
  privateOfferId?: string | null;
  pricingOverrideId?: string | null;
  requestedAt?: Date;
}

export interface SubscriptionApplyResult {
  subscription: AccountSubscriptionRecord;
  period: SubscriptionPeriodRecord;
  changeOrder: SubscriptionChangeOrderRecord;
  entitlementVersion: number;
  appliedAt: Date;
}
