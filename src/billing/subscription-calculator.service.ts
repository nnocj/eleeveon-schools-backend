import { BadRequestException, Injectable } from "@nestjs/common";
import { PricingResolutionService } from "./pricing-resolution.service";
import { SubscriptionPeriodService } from "./subscription-period.service";
import type {
  SubscriptionBillingCycle,
  SubscriptionChangeType,
  SubscriptionEffectiveMode,
} from "./types/subscription.types";
import {
  DEFAULT_PRORATION_POLICY,
  type ProrationPolicy,
  type SubscriptionQuoteResult,
} from "./types/proration.types";

@Injectable()
export class SubscriptionCalculatorService {
  constructor(
    private readonly periods: SubscriptionPeriodService,
    private readonly pricing: PricingResolutionService,
  ) {}

  private inferChangeType(input: {
    currentPlanId?: string | null;
    toPlanId: string;
    currentPeriodEnd?: Date | null;
    now: Date;
    requested?: SubscriptionChangeType;
  }): SubscriptionChangeType {
    if (input.requested) return input.requested;
    if (!input.currentPlanId) return "new";
    if (input.currentPlanId === input.toPlanId) {
      return input.currentPeriodEnd && input.currentPeriodEnd > input.now
        ? "extension"
        : "renewal";
    }
    return "upgrade";
  }

  private round(value: number, mode: ProrationPolicy["roundingMode"]): number {
    if (mode === "floor") return Math.floor(value);
    if (mode === "ceil") return Math.ceil(value);
    return Math.round(value);
  }

  async quote(input: {
    accountId: string;
    toPlanId: string;
    billingCycle: SubscriptionBillingCycle;
    requestedChangeType?: SubscriptionChangeType;
    effectiveMode?: SubscriptionEffectiveMode;
    requestedEffectiveAt?: Date | null;
    privateOfferId?: string | null;
    pricingOverrideId?: string | null;
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
    taxRatePercent?: number;
    policy?: Partial<ProrationPolicy>;
    now?: Date;
  }): Promise<SubscriptionQuoteResult> {
    const now = input.now || new Date();
    const policy = { ...DEFAULT_PRORATION_POLICY, ...(input.policy || {}) };
    const changeType = this.inferChangeType({
      currentPlanId: input.currentSubscription?.planId,
      toPlanId: input.toPlanId,
      currentPeriodEnd: input.currentSubscription?.currentPeriodEnd,
      now,
      requested: input.requestedChangeType,
    });

    const effectiveMode: SubscriptionEffectiveMode =
      changeType === "downgrade"
        ? "period_end"
        : input.effectiveMode || "immediate";

    const activeEnd = input.currentSubscription?.currentPeriodEnd || null;
    const newPeriodStart = changeType === "extension" || changeType === "renewal" || effectiveMode === "period_end"
      ? activeEnd && activeEnd > now
        ? new Date(activeEnd)
        : new Date(input.requestedEffectiveAt || now)
      : new Date(input.requestedEffectiveAt || now);

    const { startsAt, endsAt } = this.periods.calculatePeriod(
      input.billingCycle,
      newPeriodStart,
    );

    const { priceResolution } = await (async () => {
      const resolved = await this.pricing.resolve({
        accountId: input.accountId,
        planId: input.toPlanId,
        billingCycle: input.billingCycle,
        privateOfferId: input.privateOfferId,
        pricingOverrideId: input.pricingOverrideId,
        at: now,
      });
      return { priceResolution: resolved.price };
    })();

    let remainingFraction = 0;
    let usedFraction = 1;
    let remainingMilliseconds = 0;
    let usedMilliseconds = 0;
    let creditAmount = 0;
    let rawCreditAmount = 0;

    const oldStart = input.currentSubscription?.currentPeriodStart || null;
    const oldEnd = input.currentSubscription?.currentPeriodEnd || null;
    const oldPayment = input.currentPeriodPayment;

    if (oldStart && oldEnd && oldEnd > now) {
      const total = Math.max(0, oldEnd.getTime() - oldStart.getTime());
      remainingMilliseconds = Math.max(0, oldEnd.getTime() - now.getTime());
      usedMilliseconds = Math.max(0, Math.min(total, now.getTime() - oldStart.getTime()));
      remainingFraction = total > 0 ? Math.min(1, remainingMilliseconds / total) : 0;
      usedFraction = 1 - remainingFraction;

      if (changeType === "upgrade" && policy.applyUnusedCreditToImmediateUpgrade) {
        rawCreditAmount = Number(oldPayment?.amountPaid || 0) * remainingFraction;
        creditAmount = this.round(rawCreditAmount, policy.roundingMode);
      }
    }

    if (policy.capCreditAtNewPrice) {
      creditAmount = Math.min(creditAmount, priceResolution.effectivePrice);
    }

    const taxRate = Math.max(0, Number(input.taxRatePercent || 0));
    const taxable = Math.max(0, priceResolution.effectivePrice - creditAmount);
    const taxAmount = this.round((taxable * taxRate) / 100, policy.roundingMode);
    const amountDue = Math.max(
      policy.minimumAmountDue,
      taxable + taxAmount,
    );

    if (endsAt <= startsAt) {
      throw new BadRequestException("Calculated subscription period is invalid.");
    }

    return {
      accountId: input.accountId,
      fromPlanId: input.currentSubscription?.planId || null,
      toPlanId: input.toPlanId,
      changeType,
      billingCycle: input.billingCycle,
      effectiveMode,
      effectiveAt: startsAt,
      oldPeriodStart: oldStart,
      oldPeriodEnd: oldEnd,
      newPeriodStart: startsAt,
      newPeriodEnd: endsAt,
      priceResolution,
      timing: {
        calculatedAt: now,
        oldPeriod: oldStart && oldEnd
          ? {
              startsAt: oldStart,
              endsAt: oldEnd,
              totalMilliseconds: Math.max(0, oldEnd.getTime() - oldStart.getTime()),
            }
          : null,
        newPeriod: {
          startsAt,
          endsAt,
          totalMilliseconds: endsAt.getTime() - startsAt.getTime(),
        },
        remainingMilliseconds,
        usedMilliseconds,
        remainingFraction,
        usedFraction,
      },
      unusedCredit: {
        eligible: creditAmount > 0,
        currency: priceResolution.currency,
        originalAmountPaid: Number(oldPayment?.amountPaid || 0),
        originalListAmount: Number(oldPayment?.listAmount || 0),
        remainingFraction,
        rawCreditAmount,
        creditAmount,
        roundingMode: policy.roundingMode,
        cappedAtNewPrice: policy.capCreditAtNewPrice,
        reason: creditAmount > 0 ? "Unused paid time credited toward immediate upgrade." : null,
      },
      breakdown: {
        baseAmount: priceResolution.effectivePrice,
        unusedCreditAmount: creditAmount,
        discountAmount: priceResolution.discountAmount,
        taxAmount,
        amountDue,
        currency: priceResolution.currency,
        pricingSource: priceResolution.source,
        prorationApplied: creditAmount > 0,
        complimentary: priceResolution.complimentary,
      },
      calculationVersion: 1,
      quoteExpiresAt: new Date(now.getTime() + policy.quoteValidityMinutes * 60_000),
    };
  }
}
