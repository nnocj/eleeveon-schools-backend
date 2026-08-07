import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionCalculatorService } from "./subscription-calculator.service";
import type { BillingCycle } from "./types/subscription.types";

@Injectable()
export class PricingResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: SubscriptionCalculatorService,
  ) {}

  async resolve(input: {
    accountId: string;
    planId: string;
    billingCycle: BillingCycle;
    privateOfferCode?: string;
    pricingOverrideId?: string;
    at?: Date;
  }) {
    const at = input.at ?? new Date();

    const plan =
      await this.prisma.subscriptionPlan.findUnique({
        where: { id: input.planId },
      });

    if (!plan || !plan.active) {
      throw new NotFoundException(
        "Subscription plan not found or inactive.",
      );
    }

    const [assignment, override] =
      await Promise.all([
        input.privateOfferCode
          ? this.prisma.privateOfferAssignment.findFirst({
              where: {
                accountId: input.accountId,
                status: {
                  in: [
                    "assigned",
                    "active",
                    "redeemed",
                  ],
                },
                offer: {
                  code: input.privateOfferCode,
                  active: true,
                  basePlanId: input.planId,
                },
                OR: [
                  { validFrom: null },
                  { validFrom: { lte: at } },
                ],
                AND: [
                  {
                    OR: [
                      { validUntil: null },
                      { validUntil: { gt: at } },
                    ],
                  },
                ],
              },
              include: { offer: true },
            })
          : null,
        input.pricingOverrideId
          ? this.prisma.accountPricingOverride.findFirst({
              where: {
                id: input.pricingOverrideId,
                accountId: input.accountId,
                planId: input.planId,
                active: true,
              },
            })
          : this.prisma.accountPricingOverride.findFirst({
              where: {
                accountId: input.accountId,
                planId: input.planId,
                active: true,
                OR: [
                  { validFrom: null },
                  { validFrom: { lte: at } },
                ],
                AND: [
                  {
                    OR: [
                      { validUntil: null },
                      { validUntil: { gt: at } },
                    ],
                  },
                ],
              },
              orderBy: { updatedAt: "desc" },
            }),
      ]);

    const listAmount =
      this.calculator.priceForCycle(
        plan,
        input.billingCycle,
      );

    const offerPrice = assignment?.offer
      ? this.explicitPrice(
          assignment.offer,
          input.billingCycle,
        )
      : undefined;

    const overridePrice = override
      ? this.explicitPrice(
          override,
          input.billingCycle,
        )
      : undefined;

    const baseAmount =
      overridePrice ??
      offerPrice ??
      listAmount;

    const discountSource =
      override ?? assignment?.offer;

    const discountAmount =
      this.calculator.applyDiscount(
        baseAmount,
        discountSource?.discountType,
        discountSource?.discountValue,
      );

    return {
      plan,
      privateOfferAssignment: assignment,
      pricingOverride: override,
      currency:
        override?.currency ??
        assignment?.offer.currency ??
        plan.currency,
      listAmount,
      baseAmount,
      discountAmount,
    };
  }

  private explicitPrice(
    source: {
      priceMonthly?: number | null;
      priceTermly?: number | null;
      priceYearly?: number | null;
    },
    billingCycle: BillingCycle,
  ): number | undefined {
    const value =
      billingCycle === "monthly"
        ? source.priceMonthly
        : billingCycle === "termly"
          ? source.priceTermly
          : billingCycle === "yearly"
            ? source.priceYearly
            : undefined;

    return typeof value === "number"
      ? value
      : undefined;
  }
}
