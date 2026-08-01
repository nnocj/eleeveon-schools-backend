import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type SubscriptionChangeOrder } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionCalculatorService } from "./subscription-calculator.service";
import { SubscriptionPeriodService } from "./subscription-period.service";
import type {
  SubscriptionBillingCycle,
  SubscriptionChangeType,
  SubscriptionEffectiveMode,
} from "./types/subscription.types";

@Injectable()
export class SubscriptionChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: SubscriptionCalculatorService,
    private readonly periods: SubscriptionPeriodService,
  ) {}

  async createQuote(input: {
    accountId: string;
    toPlanId: string;
    billingCycle: SubscriptionBillingCycle;
    changeType?: SubscriptionChangeType;
    effectiveMode?: SubscriptionEffectiveMode;
    privateOfferId?: string | null;
    pricingOverrideId?: string | null;
    requestedByUserId?: string | null;
    taxRatePercent?: number;
  }): Promise<SubscriptionChangeOrder> {
    const subscription = await this.prisma.accountSubscription.findUnique({
      where: { accountId: input.accountId },
    });
    const currentPeriod = subscription
      ? await this.periods.getCurrentPaidPeriod(input.accountId)
      : null;

    const quote = await this.calculator.quote({
      accountId: input.accountId,
      toPlanId: input.toPlanId,
      billingCycle: input.billingCycle,
      requestedChangeType: input.changeType,
      effectiveMode: input.effectiveMode,
      privateOfferId: input.privateOfferId,
      pricingOverrideId: input.pricingOverrideId,
      taxRatePercent: input.taxRatePercent,
      currentSubscription: subscription
        ? {
            id: subscription.id,
            planId: subscription.planId,
            billingCycle: subscription.billingCycle as SubscriptionBillingCycle,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            status: subscription.status,
          }
        : null,
      currentPeriodPayment: currentPeriod
        ? {
            amountPaid: currentPeriod.amountPaid,
            listAmount: currentPeriod.listAmount,
            currency: currentPeriod.currency,
          }
        : null,
    });

    await this.prisma.subscriptionChangeOrder.updateMany({
      where: {
        accountId: input.accountId,
        status: "quoted",
        quoteExpiresAt: { gt: new Date() },
      },
      data: { status: "expired" },
    });

    return this.prisma.subscriptionChangeOrder.create({
      data: {
        accountId: input.accountId,
        subscriptionId: subscription?.id || null,
        fromPlanId: quote.fromPlanId || null,
        toPlanId: quote.toPlanId,
        privateOfferId: quote.priceResolution.privateOfferId || null,
        pricingOverrideId: quote.priceResolution.pricingOverrideId || null,
        changeType: quote.changeType,
        billingCycle: quote.billingCycle,
        effectiveMode: quote.effectiveMode,
        effectiveAt: quote.effectiveAt,
        oldPeriodStart: quote.oldPeriodStart || null,
        oldPeriodEnd: quote.oldPeriodEnd || null,
        newPeriodStart: quote.newPeriodStart,
        newPeriodEnd: quote.newPeriodEnd,
        currency: quote.breakdown.currency,
        baseAmount: quote.breakdown.baseAmount,
        creditAmount: quote.breakdown.unusedCreditAmount,
        discountAmount: quote.breakdown.discountAmount,
        taxAmount: quote.breakdown.taxAmount,
        amountDue: quote.breakdown.amountDue,
        calculation: quote as unknown as Prisma.InputJsonValue,
        calculationVersion: 1,
        status: "quoted",
        quoteExpiresAt: quote.quoteExpiresAt,
        requestedByUserId: input.requestedByUserId || null,
        schemaVersion: 1,
      },
    });
  }

  async getForAccount(accountId: string, id: string) {
    const order = await this.prisma.subscriptionChangeOrder.findFirst({
      where: { id, accountId },
      include: {
        fromPlan: true,
        toPlan: true,
        invoice: true,
        payment: true,
        resultingPeriod: true,
      },
    });
    if (!order) throw new NotFoundException("Subscription quotation not found.");
    return order;
  }

  async markPaymentPending(id: string, invoiceId: string, paymentId: string) {
    return this.prisma.subscriptionChangeOrder.update({
      where: { id },
      data: {
        status: "payment_pending",
        invoiceId,
        paymentId,
      },
    });
  }

  async cancel(accountId: string, id: string) {
    const order = await this.getForAccount(accountId, id);
    if (["applied", "cancelled", "expired"].includes(order.status)) {
      throw new BadRequestException(`Quotation cannot be cancelled from ${order.status}.`);
    }
    return this.prisma.subscriptionChangeOrder.update({
      where: { id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });
  }

  async applyPaidChangeOrder(id: string, appliedByUserId?: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.subscriptionChangeOrder.findUnique({
        where: { id },
        include: { payment: true },
      });
      if (!order) throw new NotFoundException("Subscription change order not found.");
      if (order.status === "applied") return order;
      if (order.amountDue > 0 && order.payment?.status !== "paid") {
        throw new BadRequestException("Subscription change payment is not confirmed.");
      }

      if (order.changeType === "downgrade" && order.effectiveMode === "period_end" && order.effectiveAt > new Date()) {
        const subscription = order.subscriptionId
          ? await tx.accountSubscription.findUnique({ where: { id: order.subscriptionId } })
          : null;
        if (!subscription) throw new BadRequestException("Active subscription is required for downgrade scheduling.");
        await tx.accountSubscription.update({
          where: { id: subscription.id },
          data: {
            scheduledPlanId: order.toPlanId,
            scheduledBillingCycle: order.billingCycle,
            scheduledChangeAt: order.effectiveAt,
            scheduledChangeType: "downgrade",
          },
        });
        return tx.subscriptionChangeOrder.update({
          where: { id },
          data: { status: "scheduled", paidAt: order.payment?.paidAt || new Date() },
        });
      }

      const subscription = await tx.accountSubscription.upsert({
        where: { accountId: order.accountId },
        update: {
          planId: order.toPlanId,
          billingCycle: order.billingCycle,
          status: "active",
          currentPeriodStart: order.newPeriodStart,
          currentPeriodEnd: order.newPeriodEnd,
          nextBillingDate: order.newPeriodEnd,
          cancelledAt: null,
          cancelReason: null,
          cancelAtPeriodEnd: false,
          scheduledPlanId: null,
          scheduledBillingCycle: null,
          scheduledChangeAt: null,
          scheduledChangeType: null,
          entitlementVersion: { increment: 1 },
        },
        create: {
          accountId: order.accountId,
          planId: order.toPlanId,
          billingCycle: order.billingCycle,
          status: "active",
          currentPeriodStart: order.newPeriodStart,
          currentPeriodEnd: order.newPeriodEnd,
          nextBillingDate: order.newPeriodEnd,
          entitlementVersion: 1,
          schemaVersion: 1,
        },
      });

      const period = await tx.subscriptionPeriod.create({
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
          discountAmount: order.discountAmount,
          status: "active",
          calculationVersion: 1,
          schemaVersion: 1,
          metadata: order.calculation as Prisma.InputJsonValue,
        },
      });

      await tx.subscriptionPeriod.updateMany({
        where: {
          subscriptionId: subscription.id,
          id: { not: period.id },
          status: "active",
          endsAt: { lte: order.newPeriodStart },
        },
        data: { status: "completed" },
      });

      return tx.subscriptionChangeOrder.update({
        where: { id },
        data: {
          status: "applied",
          paidAt: order.payment?.paidAt || new Date(),
          appliedAt: new Date(),
          appliedByUserId: appliedByUserId || null,
        },
        include: { resultingPeriod: true },
      });
    });
  }
}
