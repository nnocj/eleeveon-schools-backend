import { Injectable, NotFoundException } from "@nestjs/common";
import type { SubscriptionPlan } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { SubscriptionBillingCycle } from "./types/subscription.types";
import type { PriceResolution } from "./types/proration.types";

@Injectable()
export class PricingResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  planPrice(plan: SubscriptionPlan, cycle: SubscriptionBillingCycle): number {
    if (cycle === "yearly") return Number(plan.priceYearly || 0);
    if (cycle === "termly") return Number(plan.priceTermly || 0);
    return Number(plan.priceMonthly || 0);
  }

  private applyDiscount(
    amount: number,
    type?: string | null,
    value?: number | null,
  ): { effective: number; discountAmount: number; complimentary: boolean } {
    if (type === "free") {
      return { effective: 0, discountAmount: amount, complimentary: true };
    }
    if (type === "percentage") {
      const percentage = Math.min(100, Math.max(0, Number(value || 0)));
      const discountAmount = Math.round((amount * percentage) / 100);
      return {
        effective: Math.max(0, amount - discountAmount),
        discountAmount,
        complimentary: false,
      };
    }
    if (type === "fixed") {
      const discountAmount = Math.min(amount, Math.max(0, Number(value || 0)));
      return {
        effective: Math.max(0, amount - discountAmount),
        discountAmount,
        complimentary: false,
      };
    }
    return { effective: amount, discountAmount: 0, complimentary: false };
  }

  async resolve(input: {
    accountId: string;
    planId: string;
    billingCycle: SubscriptionBillingCycle;
    privateOfferId?: string | null;
    pricingOverrideId?: string | null;
    at?: Date;
  }): Promise<{ plan: SubscriptionPlan; price: PriceResolution }> {
    const at = input.at || new Date();
    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { id: input.planId, active: true },
    });
    if (!plan) throw new NotFoundException("Active plan not found.");

    const publicPlanPrice = this.planPrice(plan, input.billingCycle);

    const override = input.pricingOverrideId
      ? await this.prisma.accountPricingOverride.findFirst({
          where: {
            id: input.pricingOverrideId,
            accountId: input.accountId,
            planId: plan.id,
            active: true,
            AND: [
              { OR: [{ validFrom: null }, { validFrom: { lte: at } }] },
              { OR: [{ validUntil: null }, { validUntil: { gt: at } }] },
            ],
          },
        })
      : await this.prisma.accountPricingOverride.findFirst({
          where: {
            accountId: input.accountId,
            planId: plan.id,
            active: true,
            AND: [
              { OR: [{ validFrom: null }, { validFrom: { lte: at } }] },
              { OR: [{ validUntil: null }, { validUntil: { gt: at } }] },
            ],
          },
          orderBy: { updatedAt: "desc" },
        });

    if (override) {
      const configured = input.billingCycle === "yearly"
        ? override.priceYearly
        : input.billingCycle === "termly"
          ? override.priceTermly
          : override.priceMonthly;
      const listPrice = configured == null ? publicPlanPrice : Number(configured);
      const discount = this.applyDiscount(
        listPrice,
        override.discountType,
        override.discountValue,
      );
      return {
        plan,
        price: {
          source: "account_override",
          currency: override.currency || plan.currency,
          listPrice,
          effectivePrice: discount.effective,
          publicPlanPrice,
          pricingOverrideId: override.id,
          discountType: override.discountType as any,
          discountValue: override.discountValue,
          discountAmount: discount.discountAmount,
          complimentary: discount.complimentary,
        },
      };
    }

    const assignment = input.privateOfferId
      ? await this.prisma.privateOfferAssignment.findFirst({
          where: {
            accountId: input.accountId,
            offerId: input.privateOfferId,
            status: { in: ["assigned", "active", "redeemed"] },
          },
          include: { offer: true },
        })
      : await this.prisma.privateOfferAssignment.findFirst({
          where: {
            accountId: input.accountId,
            status: { in: ["assigned", "active", "redeemed"] },
            offer: {
              basePlanId: plan.id,
              active: true,
              AND: [
                { OR: [{ validFrom: null }, { validFrom: { lte: at } }] },
                { OR: [{ validUntil: null }, { validUntil: { gt: at } }] },
              ],
            },
          },
          include: { offer: true },
          orderBy: { updatedAt: "desc" },
        });

    if (assignment?.offer) {
      const offer = assignment.offer;
      const configured = input.billingCycle === "yearly"
        ? offer.priceYearly
        : input.billingCycle === "termly"
          ? offer.priceTermly
          : offer.priceMonthly;
      const listPrice = configured == null ? publicPlanPrice : Number(configured);
      const discount = this.applyDiscount(
        listPrice,
        offer.discountType,
        offer.discountValue,
      );
      return {
        plan,
        price: {
          source: discount.complimentary ? "complimentary" : "private_offer",
          currency: offer.currency || plan.currency,
          listPrice,
          effectivePrice: discount.effective,
          publicPlanPrice,
          privateOfferId: offer.id,
          discountType: offer.discountType as any,
          discountValue: offer.discountValue,
          discountAmount: discount.discountAmount,
          complimentary: discount.complimentary,
        },
      };
    }

    return {
      plan,
      price: {
        source: "public_plan",
        currency: plan.currency,
        listPrice: publicPlanPrice,
        effectivePrice: publicPlanPrice,
        publicPlanPrice,
        discountAmount: 0,
        complimentary: publicPlanPrice <= 0,
      },
    };
  }
}
