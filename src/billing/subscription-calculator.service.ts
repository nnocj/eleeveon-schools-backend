import { Injectable } from "@nestjs/common";
import type {
  BillingCycle,
  MoneyBreakdown,
} from "./types/subscription.types";
import type {
  ProrationInput,
  ProrationResult,
} from "./types/proration.types";

@Injectable()
export class SubscriptionCalculatorService {
  priceForCycle(
    plan: {
      priceMonthly: number;
      priceTermly: number;
      priceYearly: number;
    },
    billingCycle: BillingCycle,
  ): number {
    switch (billingCycle) {
      case "monthly":
        return plan.priceMonthly;
      case "termly":
        return plan.priceTermly;
      case "yearly":
        return plan.priceYearly;
      case "manual":
        return 0;
    }
  }

  periodEnd(
    start: Date,
    billingCycle: BillingCycle,
  ): Date {
    const end = new Date(start);

    switch (billingCycle) {
      case "monthly":
        end.setUTCMonth(end.getUTCMonth() + 1);
        return end;
      case "termly":
        end.setUTCMonth(end.getUTCMonth() + 4);
        return end;
      case "yearly":
        end.setUTCFullYear(
          end.getUTCFullYear() + 1,
        );
        return end;
      case "manual":
        return end;
    }
  }

  calculateProration(
    input: ProrationInput,
  ): ProrationResult {
    const totalMilliseconds = Math.max(
      1,
      input.currentPeriodEnd.getTime() -
        input.currentPeriodStart.getTime(),
    );

    const effectiveTime = Math.min(
      input.currentPeriodEnd.getTime(),
      Math.max(
        input.currentPeriodStart.getTime(),
        input.effectiveAt.getTime(),
      ),
    );

    const remainingMilliseconds = Math.max(
      0,
      input.currentPeriodEnd.getTime() -
        effectiveTime,
    );

    const elapsedMilliseconds =
      totalMilliseconds - remainingMilliseconds;

    const remainingRatio =
      remainingMilliseconds / totalMilliseconds;

    const creditAmount = Math.max(
      0,
      Math.floor(
        input.currentPeriodAmount *
          remainingRatio,
      ),
    );

    return {
      totalMilliseconds,
      remainingMilliseconds,
      elapsedMilliseconds,
      remainingRatio,
      creditAmount,
    };
  }

  applyDiscount(
    amount: number,
    discountType?: string | null,
    discountValue?: number | null,
  ): number {
    if (!discountType) return 0;

    if (discountType === "free") {
      return Math.max(0, amount);
    }

    if (
      discountType === "fixed" &&
      typeof discountValue === "number"
    ) {
      return Math.min(
        amount,
        Math.max(0, discountValue),
      );
    }

    if (
      discountType === "percentage" &&
      typeof discountValue === "number"
    ) {
      const percent = Math.min(
        100,
        Math.max(0, discountValue),
      );

      return Math.floor(
        amount * (percent / 100),
      );
    }

    return 0;
  }

  money(input: {
    currency: string;
    listAmount: number;
    baseAmount: number;
    creditAmount?: number;
    discountAmount?: number;
    taxAmount?: number;
  }): MoneyBreakdown {
    const creditAmount = Math.max(
      0,
      input.creditAmount ?? 0,
    );
    const discountAmount = Math.max(
      0,
      input.discountAmount ?? 0,
    );
    const taxAmount = Math.max(
      0,
      input.taxAmount ?? 0,
    );

    return {
      currency: input.currency,
      listAmount: input.listAmount,
      baseAmount: input.baseAmount,
      creditAmount,
      discountAmount,
      taxAmount,
      amountDue: Math.max(
        0,
        input.baseAmount -
          creditAmount -
          discountAmount +
          taxAmount,
      ),
    };
  }
}
