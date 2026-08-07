import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  BillingCycle,
  SubscriptionChangeType,
} from "./types/subscription.types";
import { SubscriptionCalculatorService } from "./subscription-calculator.service";

@Injectable()
export class SubscriptionPeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: SubscriptionCalculatorService,
  ) {}

  periodRange(input: {
    billingCycle: BillingCycle;
    start?: Date;
  }) {
    const startsAt = input.start ?? new Date();
    const endsAt = this.calculator.periodEnd(
      startsAt,
      input.billingCycle,
    );

    return { startsAt, endsAt };
  }

  async create(input: {
    accountId: string;
    subscriptionId: string;
    planId: string;
    billingCycle: BillingCycle;
    startsAt: Date;
    endsAt: Date;
    sourceType: SubscriptionChangeType;
    sourceId?: string;
    changeOrderId?: string;
    currency: string;
    listAmount: number;
    amountPaid: number;
    creditUsed: number;
    discountAmount: number;
    status?: string;
    calculationVersion?: number;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.subscriptionPeriod.create({
      data: {
        accountId: input.accountId,
        subscriptionId: input.subscriptionId,
        planId: input.planId,
        billingCycle: input.billingCycle,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        changeOrderId: input.changeOrderId,
        currency: input.currency,
        listAmount: input.listAmount,
        amountPaid: input.amountPaid,
        creditUsed: input.creditUsed,
        discountAmount:
          input.discountAmount,
        status: input.status ?? "active",
        calculationVersion:
          input.calculationVersion ?? 1,
        metadata: input.metadata as any,
      },
    });
  }
}
