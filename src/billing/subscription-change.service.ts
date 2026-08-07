import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";

import { PricingResolutionService } from "./pricing-resolution.service";
import { SubscriptionCalculatorService } from "./subscription-calculator.service";

import type { CreateSubscriptionQuoteDto } from "./dto/subscription-quote.dto";
import type {
  BillingCycle,
  ChangeEffectiveMode,
  SubscriptionChangeType,
  SubscriptionQuote,
} from "./types/subscription.types";

interface LegacyCreateQuoteInput {
  accountId: string;
  toPlanId: string;
  billingCycle: BillingCycle;
  changeType: SubscriptionChangeType;
  effectiveMode?: ChangeEffectiveMode;
  privateOfferId?: string;
  privateOfferCode?: string;
  pricingOverrideId?: string;
  taxRatePercent?: number;
  requestedByUserId?: string;
}

@Injectable()
export class SubscriptionChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingResolutionService,
    private readonly calculator: SubscriptionCalculatorService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * New API used by SubscriptionController.
   */
  async quote(
    accountId: string,
    dto: CreateSubscriptionQuoteDto,
  ): Promise<SubscriptionQuote> {
    const toPlanId = this.resolvePlanId(dto);

    const privateOfferCode =
      dto.privateOfferCode ??
      (dto.privateOfferId
        ? await this.offerCode(dto.privateOfferId)
        : undefined);

    const subscription =
      await this.prisma.accountSubscription.findUnique({
        where: { accountId },
        include: { plan: true },
      });

    const pricing = await this.pricing.resolve({
      accountId,
      planId: toPlanId,
      billingCycle: dto.billingCycle,
      privateOfferCode,
      pricingOverrideId: dto.pricingOverrideId,
    });

    const now = new Date();

    const effectiveMode: ChangeEffectiveMode =
      dto.effectiveMode ??
      (dto.changeType === "downgrade"
        ? "period_end"
        : "immediate");

    const effectiveAt =
      effectiveMode === "period_end" &&
      subscription?.currentPeriodEnd
        ? subscription.currentPeriodEnd
        : now;

    const newPeriodStart = effectiveAt;
    const newPeriodEnd = this.calculator.periodEnd(
      newPeriodStart,
      dto.billingCycle,
    );

    let creditAmount = 0;
    let proration:
      | Record<string, unknown>
      | undefined;

    if (
      dto.changeType === "upgrade" &&
      effectiveMode === "immediate" &&
      subscription?.currentPeriodStart &&
      subscription.currentPeriodEnd
    ) {
      const currentAmount =
        this.calculator.priceForCycle(
          subscription.plan,
          subscription.billingCycle as BillingCycle,
        );

      const result =
        this.calculator.calculateProration({
          currentPeriodStart:
            subscription.currentPeriodStart,
          currentPeriodEnd:
            subscription.currentPeriodEnd,
          effectiveAt,
          currentPeriodAmount: currentAmount,
        });

      creditAmount = result.creditAmount;
      proration = {
        ...result,
      };
    }

    const beforeTax = Math.max(
      0,
      pricing.baseAmount -
        creditAmount -
        pricing.discountAmount,
    );

    const taxRatePercent = Math.min(
      100,
      Math.max(0, dto.taxRatePercent ?? 0),
    );

    const taxAmount = Math.floor(
      beforeTax * (taxRatePercent / 100),
    );

    const money = this.calculator.money({
      currency: pricing.currency,
      listAmount: pricing.listAmount,
      baseAmount: pricing.baseAmount,
      creditAmount,
      discountAmount: pricing.discountAmount,
      taxAmount,
    });

    return {
      accountId,
      subscriptionId: subscription?.id ?? null,
      fromPlanId: subscription?.planId ?? null,
      toPlanId,
      privateOfferId:
        pricing.privateOfferAssignment?.offerId ??
        dto.privateOfferId ??
        null,
      pricingOverrideId:
        pricing.pricingOverride?.id ?? null,
      changeType: dto.changeType,
      billingCycle: dto.billingCycle,
      effectiveMode,
      effectiveAt,
      oldPeriodStart:
        subscription?.currentPeriodStart ?? null,
      oldPeriodEnd:
        subscription?.currentPeriodEnd ?? null,
      newPeriodStart,
      newPeriodEnd,
      money,
      calculation: {
        pricingSource: pricing.pricingOverride
          ? "pricing_override"
          : pricing.privateOfferAssignment
            ? "private_offer"
            : "plan",
        taxRatePercent,
        proration,
      },
      calculationVersion: 1,
      quoteExpiresAt: new Date(
        now.getTime() + 30 * 60 * 1000,
      ),
    };
  }

  /**
   * Compatibility API expected by the existing BillingService.
   */
  async createQuote(input: LegacyCreateQuoteInput) {
    const quote = await this.quote(input.accountId, {
      toPlanId: input.toPlanId,
      billingCycle: input.billingCycle,
      changeType: input.changeType,
      effectiveMode: input.effectiveMode,
      privateOfferId: input.privateOfferId,
      privateOfferCode: input.privateOfferCode,
      pricingOverrideId: input.pricingOverrideId,
      taxRatePercent: input.taxRatePercent,
    });

    return this.persistQuote(
      quote,
      input.requestedByUserId,
    );
  }

  /**
   * New API: quote and persist in one call.
   */
  async createOrder(
    accountId: string,
    dto: CreateSubscriptionQuoteDto,
  ) {
    const quote = await this.quote(accountId, dto);
    return this.persistQuote(quote);
  }

  async getForAccount(
    accountId: string,
    id: string,
  ) {
    const order =
      await this.prisma.subscriptionChangeOrder.findFirst({
        where: { id, accountId },
        include: {
          fromPlan: true,
          toPlan: true,
          privateOffer: true,
          pricingOverride: true,
          invoice: true,
          payment: true,
          resultingPeriod: true,
        },
      });

    if (!order) {
      throw new NotFoundException(
        "Subscription quotation not found.",
      );
    }

    return order;
  }

  async cancel(
    accountId: string,
    id: string,
  ) {
    const order = await this.getForAccount(
      accountId,
      id,
    );

    if (
      ["applied", "cancelled", "expired"].includes(
        order.status,
      )
    ) {
      throw new BadRequestException(
        `Subscription quotation is already ${order.status}.`,
      );
    }

    return this.prisma.subscriptionChangeOrder.update({
      where: { id: order.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
      },
    });
  }

  async markPaymentPending(
    orderId: string,
    invoiceId: string,
    paymentId: string,
  ) {
    const order =
      await this.prisma.subscriptionChangeOrder.findUnique({
        where: { id: orderId },
      });

    if (!order) {
      throw new NotFoundException(
        "Subscription change order not found.",
      );
    }

    return this.prisma.subscriptionChangeOrder.update({
      where: { id: orderId },
      data: {
        invoiceId,
        paymentId,
        status: "payment_pending",
      },
    });
  }

  /**
   * Compatibility method called after Paystack/manual payment succeeds.
   */
  async applyPaidChangeOrder(
    orderId: string,
    appliedByUserId?: string,
  ) {
    const order =
      await this.prisma.subscriptionChangeOrder.findUnique({
        where: { id: orderId },
      });

    if (!order) {
      throw new NotFoundException(
        "Subscription change order not found.",
      );
    }

    if (order.status === "applied") {
      return order;
    }

    if (
      !["paid", "payment_pending", "scheduled"].includes(
        order.status,
      )
    ) {
      throw new BadRequestException(
        `Subscription change order cannot be applied from status ${order.status}.`,
      );
    }

    if (order.status !== "paid") {
      await this.prisma.subscriptionChangeOrder.update({
        where: { id: order.id },
        data: {
          status: "paid",
          paidAt: order.paidAt ?? new Date(),
        },
      });
    }

    return this.apply(order.id, {
      paymentId: order.paymentId ?? undefined,
      appliedByUserId,
    });
  }

  async apply(
    changeOrderId: string,
    options?: {
      paymentId?: string;
      appliedByUserId?: string;
    },
  ) {
    const order =
      await this.prisma.subscriptionChangeOrder.findUnique({
        where: { id: changeOrderId },
      });

    if (!order) {
      throw new NotFoundException(
        "Subscription change order not found.",
      );
    }

    if (order.status === "applied") {
      return order;
    }

    if (
      order.amountDue > 0 &&
      !["paid", "scheduled"].includes(order.status)
    ) {
      throw new BadRequestException(
        "The subscription change must be paid before it can be applied.",
      );
    }

    const applied = await this.prisma.$transaction(
      async (tx) => {
        const subscription =
          await tx.accountSubscription.upsert({
            where: { accountId: order.accountId },
            update: {
              planId: order.toPlanId,
              status: "active",
              billingCycle: order.billingCycle,
              deploymentMode: "connected",
              syncPolicy: "full",
              updatePolicy: "continuous",
              currentPeriodStart:
                order.newPeriodStart,
              currentPeriodEnd: order.newPeriodEnd,
              nextBillingDate: order.newPeriodEnd,
              scheduledPlanId: null,
              scheduledBillingCycle: null,
              scheduledChangeAt: null,
              scheduledChangeType: null,
              cancelledAt: null,
              cancelReason: null,
              entitlementVersion: {
                increment: 1,
              },
            },
            create: {
              accountId: order.accountId,
              planId: order.toPlanId,
              status: "active",
              billingCycle: order.billingCycle,
              deploymentMode: "connected",
              syncPolicy: "full",
              updatePolicy: "continuous",
              currentPeriodStart:
                order.newPeriodStart,
              currentPeriodEnd: order.newPeriodEnd,
              nextBillingDate: order.newPeriodEnd,
              entitlementVersion: 1,
            },
          });

        const existingPeriod =
          await tx.subscriptionPeriod.findUnique({
            where: {
              changeOrderId: order.id,
            },
          });

        if (!existingPeriod) {
          await tx.subscriptionPeriod.create({
            data: {
              accountId: order.accountId,
              subscriptionId: subscription.id,
              planId: order.toPlanId,
              billingCycle: order.billingCycle,
              startsAt: order.newPeriodStart,
              endsAt: order.newPeriodEnd,
              sourceType: order.changeType,
              sourceId: order.id,
              changeOrderId: order.id,
              currency: order.currency,
              listAmount: order.baseAmount,
              amountPaid: order.amountDue,
              creditUsed: order.creditAmount,
              discountAmount:
                order.discountAmount,
              status: "active",
              calculationVersion:
                order.calculationVersion,
            },
          });
        }

        return tx.subscriptionChangeOrder.update({
          where: { id: order.id },
          data: {
            status: "applied",
            paymentId:
              options?.paymentId ??
              order.paymentId,
            paidAt:
              order.paidAt ??
              (order.amountDue === 0
                ? new Date()
                : undefined),
            appliedAt: new Date(),
            appliedByUserId:
              options?.appliedByUserId,
          },
        });
      },
    );

    await this.entitlements.rebuild(order.accountId);

    return applied;
  }

  async scheduleDowngrade(
    changeOrderId: string,
  ) {
    const order =
      await this.prisma.subscriptionChangeOrder.findUnique({
        where: { id: changeOrderId },
      });

    if (!order) {
      throw new NotFoundException(
        "Subscription change order not found.",
      );
    }

    if (
      order.changeType !== "downgrade" ||
      order.effectiveMode !== "period_end"
    ) {
      throw new BadRequestException(
        "Only period-end downgrades can be scheduled.",
      );
    }

    await this.prisma.accountSubscription.update({
      where: { accountId: order.accountId },
      data: {
        scheduledPlanId: order.toPlanId,
        scheduledBillingCycle:
          order.billingCycle,
        scheduledChangeAt: order.effectiveAt,
        scheduledChangeType: "downgrade",
      },
    });

    return this.prisma.subscriptionChangeOrder.update({
      where: { id: order.id },
      data: { status: "scheduled" },
    });
  }

  private async persistQuote(
    quote: SubscriptionQuote,
    requestedByUserId?: string,
  ) {
    return this.prisma.subscriptionChangeOrder.create({
      data: {
        accountId: quote.accountId,
        subscriptionId: quote.subscriptionId,
        fromPlanId: quote.fromPlanId,
        toPlanId: quote.toPlanId,
        privateOfferId: quote.privateOfferId,
        pricingOverrideId:
          quote.pricingOverrideId,
        changeType: quote.changeType,
        billingCycle: quote.billingCycle,
        effectiveMode: quote.effectiveMode,
        effectiveAt: quote.effectiveAt,
        oldPeriodStart: quote.oldPeriodStart,
        oldPeriodEnd: quote.oldPeriodEnd,
        newPeriodStart: quote.newPeriodStart,
        newPeriodEnd: quote.newPeriodEnd,
        currency: quote.money.currency,
        baseAmount: quote.money.baseAmount,
        creditAmount:
          quote.money.creditAmount,
        discountAmount:
          quote.money.discountAmount,
        taxAmount: quote.money.taxAmount,
        amountDue: quote.money.amountDue,
        calculation:
          quote.calculation as Prisma.InputJsonValue,
        calculationVersion:
          quote.calculationVersion,
        status:
          quote.money.amountDue === 0
            ? "paid"
            : "quoted",
        quoteExpiresAt:
          quote.quoteExpiresAt,
        requestedByUserId,
        paidAt:
          quote.money.amountDue === 0
            ? new Date()
            : undefined,
      },
    });
  }

  private resolvePlanId(
    dto: CreateSubscriptionQuoteDto,
  ): string {
    const planId = dto.toPlanId ?? dto.planId;

    if (!planId) {
      throw new BadRequestException(
        "Provide either toPlanId or planId.",
      );
    }

    return planId;
  }

  private async offerCode(
    privateOfferId: string,
  ): Promise<string> {
    const offer =
      await this.prisma.privateOffer.findUnique({
        where: { id: privateOfferId },
        select: { code: true },
      });

    if (!offer) {
      throw new NotFoundException(
        "Private offer not found.",
      );
    }

    return offer.code;
  }
}