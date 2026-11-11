import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { parseStudentPricing } from "./student-pricing";

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
  requestedStudentCount?: number;
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
      requestedStudentCount: dto.requestedStudentCount,
    });

    // Stage 6 implementation 1: no unverified credits or prorations for
    // a tiered plan. Only straightforward new/renewal quotes are allowed.
    if (pricing.studentPricingMode !== "fixed" &&
        !["new", "renewal"].includes(dto.changeType)) {
      throw new BadRequestException("Student-priced plan changes other than new/renewal are not enabled yet.");
    }

    const now = new Date();

    const effectiveMode: ChangeEffectiveMode =
      dto.effectiveMode ??
      (dto.changeType === "downgrade"
        ? "period_end"
        : "immediate");

    if (pricing.studentPricingMode !== "fixed" && effectiveMode !== "immediate") {
      throw new BadRequestException("Student-priced quotes must take effect immediately after verified payment.");
    }

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
        // Persisted into the change order for subsequent settlement verification.
        studentCount: pricing.studentCount ?? null,
        prepaidStudentLimit: pricing.studentPricingMode !== "fixed" ? pricing.studentCount ?? null : null,
        purchaseType: pricing.studentPricingMode !== "fixed" ? "prepaid_capacity" : null,
        studentPricingMode: pricing.studentPricingMode,
        authoritativeAt: pricing.studentCount == null ? null : now.toISOString(),
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
      requestedStudentCount: input.requestedStudentCount,
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
    verifiedTerminalFailure = false,
  ) {
    const order = await this.getForAccount(accountId, id);
    if (["applied", "cancelled", "expired", "paid", "scheduled"].includes(order.status)) {
      throw new BadRequestException(`Subscription quotation cannot be cancelled in status ${order.status}.`);
    }
    const studentPriced = parseStudentPricing(order.toPlan.metadata).mode !== "fixed";
    const cancelFailedPayment = studentPriced && order.status === "payment_pending" && verifiedTerminalFailure;
    if (studentPriced && order.status !== "quoted" && !cancelFailedPayment) {
      throw new BadRequestException("Payment has started. Verify its terminal failure with Paystack before cancellation.");
    }
    if (cancelFailedPayment && (!order.paymentId || !order.payment ||
        order.payment.accountId !== accountId || order.payment.status !== "failed" ||
        !order.payment.providerReference)) {
      throw new BadRequestException("The linked payment is not confirmed failed. Cancellation refused.");
    }
    // The guarded write prevents a concurrent order-state transition from being overwritten.
    // The Paystack transaction was verified as terminal by BillingService immediately before this call.
    const changed = await this.prisma.subscriptionChangeOrder.updateMany({
      where: { id: order.id, accountId, status: order.status,
        ...(cancelFailedPayment ? { paymentId: order.paymentId } : {}) },
      data: { status: "cancelled", cancelledAt: new Date(),
        ...(cancelFailedPayment ? { failureReason: "Paystack verified terminal failed/abandoned before cancellation" } : {}) },
    });
    if (changed.count !== 1) throw new BadRequestException("Quotation state changed; check payment again before cancelling.");
    return this.getForAccount(accountId, id);
  }

  async markPaymentPending(orderId: string, invoiceId: string, paymentId: string) {
    const current = await this.prisma.subscriptionChangeOrder.findUnique({ where: { id: orderId } });
    if (!current) throw new NotFoundException("Subscription change order not found.");
    // A single order may be claimed once. This also prevents late checkout
    // initialization from undoing an already-paid/applied order.
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: current.toPlanId }, select: { metadata: true },
    });
    if (!plan) throw new BadRequestException("Destination plan no longer exists.");
    const pricing = parseStudentPricing(plan.metadata);
    const allowedStatus = pricing.mode === "fixed" ? "quoted" : "checkout_initializing";
    const claimed = await this.prisma.subscriptionChangeOrder.updateMany({
      where: {
        id: orderId,
        status: allowedStatus,
        invoiceId: null,
        paymentId: null,
      },
      data: { invoiceId, paymentId, status: "payment_pending" },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException("Checkout has already been linked to a payment; recover the existing checkout.");
    }
    return this.prisma.subscriptionChangeOrder.findUnique({ where: { id: orderId } });
  }

  /** Payment callbacks enter here, including repeated and concurrent webhooks. */
  async applyPaidChangeOrder(orderId: string, appliedByUserId?: string) {
    const order = await this.prisma.subscriptionChangeOrder.findUnique({
      where: { id: orderId }, include: { toPlan: true },
    });
    if (!order) throw new NotFoundException("Subscription change order not found.");
    if (order.status === "applied") return order;
    if (!["paid", "payment_pending", "scheduled"].includes(order.status)) {
      throw new BadRequestException(`Cannot activate an order in status ${order.status}.`);
    }

    // Both fixed and student-priced paid orders must have an actual settled
    // payment. A callback must never manufacture a paid quote from an unpaid one.
    if (order.amountDue > 0) {
      if (!order.paymentId || !order.invoiceId) {
        throw new BadRequestException("Paid order is missing its payment/invoice.");
      }
      const payment = await this.prisma.appPayment.findUnique({ where: { id: order.paymentId } });
      if (!payment || payment.status !== "paid" || payment.accountId !== order.accountId ||
          payment.invoiceId !== order.invoiceId || payment.amount !== order.amountDue ||
          payment.currency !== order.currency) {
        throw new BadRequestException("Order cannot activate until its matching payment is settled.");
      }
    }

    if (order.status === "payment_pending") {
      const promoted = await this.prisma.subscriptionChangeOrder.updateMany({
        where: { id: order.id, status: "payment_pending", paymentId: order.paymentId },
        data: { status: "paid", paidAt: order.paidAt ?? new Date() },
      });
      if (!promoted.count) {
        const fresh = await this.prisma.subscriptionChangeOrder.findUnique({ where: { id: order.id } });
        if (fresh?.status === "applied") return fresh;
        if (fresh?.status !== "paid") throw new BadRequestException("Order changed during settlement.");
      }
    }
    return this.apply(order.id, { paymentId: order.paymentId ?? undefined, appliedByUserId });
  }

  async apply(
    changeOrderId: string,
    options?: { paymentId?: string; appliedByUserId?: string },
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize all plan changes for one account in PostgreSQL, including
      // duplicate webhook workers executing in different application replicas.
      const initial = await tx.subscriptionChangeOrder.findUnique({ where: { id: changeOrderId } });
      if (!initial) throw new NotFoundException("Subscription change order not found.");
      // PostgreSQL returns void here; cast it so Prisma 7 / adapter-pg can deserialize the row.
      // The transaction-scoped advisory lock is still acquired and held until commit/rollback.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${initial.accountId}))::text AS "lockResult"`;
      const order = await tx.subscriptionChangeOrder.findUnique({
        where: { id: changeOrderId }, include: { toPlan: true },
      });
      if (!order) throw new NotFoundException("Subscription change order not found.");
      if (order.status === "applied") return { order, newlyApplied: false };
      if (!["paid", "scheduled"].includes(order.status)) {
        throw new BadRequestException(`Order cannot be applied from status ${order.status}.`);
      }

      let pricing;
      try { pricing = parseStudentPricing(order.toPlan.metadata); }
      catch { throw new BadRequestException("Destination plan pricing is invalid."); }
      if (order.status === "scheduled" && pricing.mode !== "fixed") {
        throw new BadRequestException("Student-priced scheduled changes are not supported.");
      }
      if (pricing.mode !== "fixed") {
        const checkoutMode = (process.env.STUDENT_PRICED_CHECKOUT_MODE || "off").trim().toLowerCase();
        const paystackMode = (process.env.PAYSTACK_MODE || (process.env.NODE_ENV === "production" ? "live" : "test")).trim().toLowerCase();
        if (!(checkoutMode === paystackMode && ["test", "live"].includes(checkoutMode))) {
          throw new BadRequestException("Student-priced activation is disabled.");
        }
      }

      if (order.amountDue > 0) {
        if (!order.paymentId || !order.invoiceId) throw new BadRequestException("Order payment is missing.");
        const payment = await tx.appPayment.findUnique({ where: { id: order.paymentId } });
        if (!payment || payment.status !== "paid" || payment.accountId !== order.accountId ||
            payment.invoiceId !== order.invoiceId || payment.amount !== order.amountDue ||
            payment.currency !== order.currency) {
          throw new BadRequestException("Payment does not match this order.");
        }
        if (pricing.mode !== "fixed") {
          const proof = payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
            ? (payment.metadata as Record<string, any>).verifiedSettlement : null;
          if (payment.provider !== "paystack" || !payment.providerReference ||
              proof?.provider !== "paystack" || proof.reference !== payment.providerReference ||
              proof.amount !== payment.amount || proof.currency !== payment.currency) {
            throw new BadRequestException("Verified Paystack settlement proof is missing.");
          }
        }
      } else if (pricing.mode !== "fixed") {
        throw new BadRequestException("Student-priced plan cannot be activated without a paid transaction.");
      }

      // Atomic state claim and all subscription side effects share one tx.
      const claimed = await tx.subscriptionChangeOrder.updateMany({
        where: { id: order.id, status: order.status },
        data: {
          status: "applied",
          paymentId: options?.paymentId ?? order.paymentId,
          appliedAt: new Date(),
          appliedByUserId: options?.appliedByUserId,
        },
      });
      if (claimed.count !== 1) throw new BadRequestException("Order was applied by another request.");
      // Capture paid capacity only after verified settlement. Never allow
      // a browser-supplied quantity to update an entitlement before payment.
      const orderCalculation = order.calculation && typeof order.calculation === "object" && !Array.isArray(order.calculation)
        ? order.calculation as Record<string, unknown> : {};
      const prepaid = pricing.mode !== "fixed";
      const paidSeats = Number(orderCalculation.prepaidStudentLimit ?? orderCalculation.studentCount);
      if (prepaid && (!Number.isSafeInteger(paidSeats) || paidSeats < 1)) {
        throw new BadRequestException("Paid prepaid-capacity order has no valid purchased student allowance.");
      }
      const existingSubscription = await tx.accountSubscription.findUnique({
        where: { accountId: order.accountId }, select: { metadata: true },
      });
      const existingMeta = existingSubscription?.metadata && typeof existingSubscription.metadata === "object" && !Array.isArray(existingSubscription.metadata)
        ? existingSubscription.metadata as Record<string, unknown> : {};
      const { prepaidStudentLimit: _oldLimit, prepaidPlanId: _oldPlan, prepaidSourceOrderId: _oldOrder, ...otherMetadata } = existingMeta;
      const subscriptionMetadata = (prepaid
        ? { ...otherMetadata, prepaidStudentLimit: paidSeats, prepaidPlanId: order.toPlanId, prepaidSourceOrderId: order.id }
        : otherMetadata) as Prisma.InputJsonValue;
      const subscription = await tx.accountSubscription.upsert({
        where: { accountId: order.accountId },
        update: {
          planId: order.toPlanId,
          metadata: subscriptionMetadata,
          status: "active",
          billingCycle: order.billingCycle,
          deploymentMode: "connected",
          syncPolicy: "full",
          updatePolicy: "continuous",
          currentPeriodStart: order.newPeriodStart,
          currentPeriodEnd: order.newPeriodEnd,
          nextBillingDate: order.newPeriodEnd,
          scheduledPlanId: null, scheduledBillingCycle: null,
          scheduledChangeAt: null, scheduledChangeType: null,
          cancelledAt: null, cancelReason: null,
          entitlementVersion: { increment: 1 },
        },
        create: {
          accountId: order.accountId,
          planId: order.toPlanId,
          metadata: subscriptionMetadata,
          status: "active", billingCycle: order.billingCycle,
          deploymentMode: "connected", syncPolicy: "full", updatePolicy: "continuous",
          currentPeriodStart: order.newPeriodStart,
          currentPeriodEnd: order.newPeriodEnd,
          nextBillingDate: order.newPeriodEnd,
          entitlementVersion: 1,
        },
      });
      // Unique changeOrderId ensures one subscription period per paid order.
      await tx.subscriptionPeriod.upsert({
        where: { changeOrderId: order.id },
        create: {
          accountId: order.accountId,
          subscriptionId: subscription.id,
          planId: order.toPlanId,
          billingCycle: order.billingCycle,
          startsAt: order.newPeriodStart,
          endsAt: order.newPeriodEnd,
          sourceType: order.changeType, sourceId: order.id,
          changeOrderId: order.id,
          currency: order.currency,
          listAmount: order.baseAmount,
          amountPaid: order.amountDue,
          creditUsed: order.creditAmount,
          discountAmount: order.discountAmount,
          status: "active",
          calculationVersion: order.calculationVersion,
        },
        update: {},
      });
      const applied = await tx.subscriptionChangeOrder.findUnique({ where: { id: order.id } });
      return { order: applied!, newlyApplied: true };
    }, { timeout: 15000 });
    // Entitlement rebuilding is retryable; no second subscription period or
    // entitlementVersion increment occurs when a duplicate webhook replays.
    // An outbox/worker is still recommended for guaranteed delivery on crashes.
    await this.entitlements.rebuild(result.order.accountId);
    return result.order;
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