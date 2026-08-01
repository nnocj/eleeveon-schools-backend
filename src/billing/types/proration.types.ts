/**
 * src/billing/types/proration.types.ts
 * --------------------------------------------------------------------------
 * Shared version-one quotation and proration contracts.
 *
 * Monetary values are stored as whole minor application units matching the
 * current Prisma billing schema (for example whole GHS values where the
 * platform currently stores Int prices).
 */

import type {
  SubscriptionBillingCycle,
  SubscriptionChangeType,
  SubscriptionEffectiveMode,
} from "./subscription.types";

export const PRORATION_CALCULATION_VERSION = 1 as const;

export type ProrationRoundingMode =
  | "floor"
  | "ceil"
  | "nearest";

export type PricingSource =
  | "public_plan"
  | "private_offer"
  | "account_override"
  | "complimentary"
  | "manual";

export interface MoneyAmount {
  currency: string;
  amount: number;
}

export interface ProrationPeriod {
  startsAt: Date;
  endsAt: Date;
  totalMilliseconds: number;
}

export interface ProrationTiming {
  calculatedAt: Date;
  oldPeriod?: ProrationPeriod | null;
  newPeriod: ProrationPeriod;

  remainingMilliseconds: number;
  usedMilliseconds: number;
  remainingFraction: number;
  usedFraction: number;
}

export interface PriceResolution {
  source: PricingSource;
  currency: string;
  listPrice: number;
  effectivePrice: number;

  publicPlanPrice?: number | null;
  privateOfferId?: string | null;
  pricingOverrideId?: string | null;

  discountType?: "fixed" | "percentage" | "free" | null;
  discountValue?: number | null;
  discountAmount: number;

  complimentary: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface UnusedCreditCalculation {
  eligible: boolean;
  currency: string;

  originalAmountPaid: number;
  originalListAmount: number;

  remainingFraction: number;
  rawCreditAmount: number;
  creditAmount: number;

  roundingMode: ProrationRoundingMode;
  cappedAtNewPrice: boolean;

  reason?: string | null;
}

export interface SubscriptionQuoteBreakdown {
  baseAmount: number;
  unusedCreditAmount: number;
  discountAmount: number;
  taxAmount: number;
  amountDue: number;

  currency: string;

  pricingSource: PricingSource;
  prorationApplied: boolean;
  complimentary: boolean;
}

export interface SubscriptionQuoteInput {
  accountId: string;
  toPlanId: string;

  changeType: SubscriptionChangeType;
  billingCycle: SubscriptionBillingCycle;
  effectiveMode: SubscriptionEffectiveMode;

  calculatedAt?: Date;
  requestedEffectiveAt?: Date | null;

  currentSubscription?: {
    id: string;
    planId: string;
    billingCycle: SubscriptionBillingCycle;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    status: string;
  } | null;

  currentPeriodPayment?: {
    amountPaid: number;
    listAmount: number;
    currency: string;
  } | null;

  privateOfferId?: string | null;
  pricingOverrideId?: string | null;

  taxRatePercent?: number;
  roundingMode?: ProrationRoundingMode;

  metadata?: Record<string, unknown> | null;
}

export interface SubscriptionQuoteResult {
  accountId: string;

  fromPlanId?: string | null;
  toPlanId: string;

  changeType: SubscriptionChangeType;
  billingCycle: SubscriptionBillingCycle;
  effectiveMode: SubscriptionEffectiveMode;
  effectiveAt: Date;

  oldPeriodStart?: Date | null;
  oldPeriodEnd?: Date | null;
  newPeriodStart: Date;
  newPeriodEnd: Date;

  priceResolution: PriceResolution;
  timing: ProrationTiming;
  unusedCredit: UnusedCreditCalculation;
  breakdown: SubscriptionQuoteBreakdown;

  calculationVersion: typeof PRORATION_CALCULATION_VERSION;
  quoteExpiresAt: Date;

  metadata?: Record<string, unknown> | null;
}

export interface ProrationPolicy {
  version: typeof PRORATION_CALCULATION_VERSION;

  roundingMode: ProrationRoundingMode;
  quoteValidityMinutes: number;

  applyUnusedCreditToImmediateUpgrade: boolean;
  applyUnusedCreditToRenewal: boolean;
  applyUnusedCreditToExtension: boolean;

  downgradeEffectiveMode: "period_end";
  capCreditAtNewPrice: boolean;
  minimumAmountDue: number;
}

export const DEFAULT_PRORATION_POLICY: ProrationPolicy = {
  version: PRORATION_CALCULATION_VERSION,
  roundingMode: "nearest",
  quoteValidityMinutes: 30,

  applyUnusedCreditToImmediateUpgrade: true,
  applyUnusedCreditToRenewal: false,
  applyUnusedCreditToExtension: false,

  downgradeEffectiveMode: "period_end",
  capCreditAtNewPrice: true,
  minimumAmountDue: 0,
};

export interface ProrationAuditCalculation {
  version: typeof PRORATION_CALCULATION_VERSION;
  policy: ProrationPolicy;
  input: {
    oldPrice: number;
    newPrice: number;
    amountPaid: number;
    remainingFraction: number;
    taxRatePercent: number;
  };
  output: SubscriptionQuoteBreakdown;
  generatedAt: string;
}
