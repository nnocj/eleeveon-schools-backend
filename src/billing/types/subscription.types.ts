export type BillingCycle =
  | "monthly"
  | "termly"
  | "yearly"
  | "manual";

export type SubscriptionChangeType =
  | "new"
  | "renewal"
  | "extension"
  | "upgrade"
  | "downgrade"
  | "complimentary"
  | "manual_change";

export type ChangeEffectiveMode =
  | "immediate"
  | "period_end";

export type SubscriptionChangeStatus =
  | "quoted"
  | "payment_pending"
  | "paid"
  | "scheduled"
  | "applied"
  | "cancelled"
  | "expired"
  | "failed";

export type DiscountType =
  | "fixed"
  | "percentage"
  | "free";

export interface MoneyBreakdown {
  currency: string;
  listAmount: number;
  baseAmount: number;
  creditAmount: number;
  discountAmount: number;
  taxAmount: number;
  amountDue: number;
}

export interface SubscriptionQuote {
  accountId: string;
  subscriptionId?: string | null;

  fromPlanId?: string | null;
  toPlanId: string;

  privateOfferId?: string | null;
  pricingOverrideId?: string | null;

  changeType: SubscriptionChangeType;
  billingCycle: BillingCycle;
  effectiveMode: ChangeEffectiveMode;
  effectiveAt: Date;

  oldPeriodStart?: Date | null;
  oldPeriodEnd?: Date | null;
  newPeriodStart: Date;
  newPeriodEnd: Date;

  money: MoneyBreakdown;
  calculation: Record<string, unknown>;
  calculationVersion: number;
  quoteExpiresAt: Date;
}
