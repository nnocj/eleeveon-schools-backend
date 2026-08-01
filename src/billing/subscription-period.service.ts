import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma, SubscriptionPeriod } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  SubscriptionBillingCycle,
  SubscriptionDateRange,
  SubscriptionPeriodSourceType,
  SubscriptionPeriodStatus,
} from "./types/subscription.types";

@Injectable()
export class SubscriptionPeriodService {
  constructor(private readonly prisma: PrismaService) {}

  monthsForCycle(cycle: SubscriptionBillingCycle): number | null {
    if (cycle === "monthly") return 1;
    if (cycle === "termly") return 4;
    if (cycle === "yearly") return 12;
    return null;
  }

  addCalendarMonths(source: Date, months: number): Date {
    const result = new Date(source);
    const originalDay = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(
      result.getUTCFullYear(),
      result.getUTCMonth() + 1,
      0,
    )).getUTCDate();
    result.setUTCDate(Math.min(originalDay, lastDay));
    return result;
  }

  calculatePeriod(
    cycle: SubscriptionBillingCycle,
    startAt: Date,
    explicitEndAt?: Date | null,
  ): SubscriptionDateRange {
    const startsAt = new Date(startAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException("Invalid subscription start date.");
    }

    const months = this.monthsForCycle(cycle);
    if (months === null) {
      if (!explicitEndAt) {
        throw new BadRequestException(
          "Manual billing requires an explicit period end date.",
        );
      }
      const endsAt = new Date(explicitEndAt);
      if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
        throw new BadRequestException("Invalid manual subscription end date.");
      }
      return { startsAt, endsAt };
    }

    return {
      startsAt,
      endsAt: this.addCalendarMonths(startsAt, months),
    };
  }

  remainingFraction(
    startsAt: Date,
    endsAt: Date,
    at: Date = new Date(),
  ): number {
    const total = Math.max(0, endsAt.getTime() - startsAt.getTime());
    if (total === 0) return 0;
    const remaining = Math.max(0, endsAt.getTime() - at.getTime());
    return Math.min(1, remaining / total);
  }

  async getCurrentPaidPeriod(
    accountId: string,
    at: Date = new Date(),
  ): Promise<SubscriptionPeriod | null> {
    return this.prisma.subscriptionPeriod.findFirst({
      where: {
        accountId,
        status: { in: ["active", "completed"] },
        startsAt: { lte: at },
        endsAt: { gt: at },
      },
      orderBy: { endsAt: "desc" },
    });
  }

  async createPeriod(input: {
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
    creditUsed?: number;
    discountAmount?: number;
    status?: SubscriptionPeriodStatus;
    metadata?: Prisma.InputJsonValue;
  }): Promise<SubscriptionPeriod> {
    return this.prisma.subscriptionPeriod.create({
      data: {
        accountId: input.accountId,
        subscriptionId: input.subscriptionId,
        planId: input.planId,
        billingCycle: input.billingCycle,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        sourceType: input.sourceType,
        sourceId: input.sourceId || null,
        changeOrderId: input.changeOrderId || null,
        currency: input.currency,
        listAmount: input.listAmount,
        amountPaid: input.amountPaid,
        creditUsed: input.creditUsed || 0,
        discountAmount: input.discountAmount || 0,
        status: input.status || "active",
        calculationVersion: 1,
        schemaVersion: 1,
        metadata: input.metadata,
      },
    });
  }
}
