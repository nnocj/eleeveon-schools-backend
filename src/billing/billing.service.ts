import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import * as crypto from "crypto";

import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

import { AuthUser } from "../common/auth-user";

import { assertSameAccountOrDeveloper } from "../common/scope";

import { isDeveloper } from "../common/roles";

import {
  CreateInvoiceDto,
  CreatePaymentDto,
  CreatePlanDto,
  CreateSubscriptionDto,
  UpdateInvoiceDto,
  UpdatePaymentDto,
  UpdatePlanDto,
  UpdateSubscriptionDto,
} from "./dto/billing.dto";

import { PaymentProviderService } from "./payment-providers/payment-provider.service";
import { SubscriptionChangeService } from "./subscription-change.service";
import type { CreateSubscriptionQuoteDto } from "./dto/subscription-quote.dto";
import type { PaySubscriptionChangeDto } from "./dto/subscription-change.dto";

type PaymentMethod =
  | "momo"
  | "card"
  | "bank"
  | "cash"
  | "manual";

type PaystackMode = "test" | "live";

type BillingCycle = "monthly" | "termly" | "yearly";

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProviderService: PaymentProviderService,
    private readonly subscriptionChanges: SubscriptionChangeService
  ) {}

  // =====================================================
  // ENV / PAYSTACK HELPERS
  // =====================================================

  private getPaystackMode(): PaystackMode {
    const raw =
      process.env.PAYSTACK_MODE ||
      (process.env.NODE_ENV === "production"
        ? "live"
        : "test");

    return raw === "live" ? "live" : "test";
  }

  private getPaystackSecretKey() {
    const mode = this.getPaystackMode();

    const secret =
      mode === "live"
        ? process.env.PAYSTACK_LIVE_SECRET_KEY ||
          process.env.PAYSTACK_SECRET_KEY ||
          ""
        : process.env.PAYSTACK_TEST_SECRET_KEY ||
          process.env.PAYSTACK_SECRET_KEY ||
          "";

    const cleaned = secret.trim();

    if (!cleaned) {
      throw new BadRequestException(
        `Paystack ${mode} secret key is missing.`
      );
    }

    if (mode === "live" && !cleaned.startsWith("sk_live_")) {
      throw new BadRequestException(
        "Invalid Paystack live secret key. Expected sk_live_ key."
      );
    }

    if (mode === "test" && !cleaned.startsWith("sk_test_")) {
      throw new BadRequestException(
        "Invalid Paystack test secret key. Expected sk_test_ key."
      );
    }

    return cleaned;
  }

  private getPaystackCallbackUrl() {
    const mode = this.getPaystackMode();

    return (
      mode === "live"
        ? process.env.PAYSTACK_LIVE_CALLBACK_URL ||
          process.env.PAYSTACK_CALLBACK_URL ||
          ""
        : process.env.PAYSTACK_TEST_CALLBACK_URL ||
          process.env.PAYSTACK_CALLBACK_URL ||
          ""
    ).trim();
  }

  private verifyPaystackSignature(signature: string, body: any) {
    if (!signature) {
      throw new BadRequestException(
        "Missing Paystack webhook signature."
      );
    }

    const secret = this.getPaystackSecretKey();

    const hash = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(body))
      .digest("hex");

    const left = Buffer.from(hash, "utf8");
    const right = Buffer.from(signature, "utf8");

    if (
      left.length !== right.length ||
      !crypto.timingSafeEqual(left, right)
    ) {
      throw new BadRequestException(
        "Invalid Paystack webhook signature."
      );
    }
  }

  // =====================================================
  // GENERAL HELPERS
  // =====================================================

  private developerOnly(actor: AuthUser) {
    if (!isDeveloper(actor.role)) {
      throw new ForbiddenException(
        "Only developer can manage platform billing setup."
      );
    }
  }

  private normalizePaymentMethod(method?: string): PaymentMethod {
    const allowed: PaymentMethod[] = [
      "momo",
      "card",
      "bank",
      "cash",
      "manual",
    ];

    if (!method) return "manual";

    if (!allowed.includes(method as PaymentMethod)) {
      throw new BadRequestException(
        "Invalid payment method."
      );
    }

    return method as PaymentMethod;
  }

  private normalizeProvider(provider?: string, method?: PaymentMethod) {
    if (provider === "paystack") return "paystack";

    if (
      method === "momo" ||
      method === "card" ||
      method === "bank"
    ) {
      return "paystack";
    }

    return "manual";
  }

  private normalizeBillingCycle(value?: string): BillingCycle {
    if (value === "termly") return "termly";
    if (value === "yearly") return "yearly";
    return "monthly";
  }

  /**
   * Adds calendar months without allowing dates such as 31 January to roll
   * into March. The result is clamped to the final valid day of the target
   * month.
   */
  private addCalendarMonths(source: Date, months: number) {
    const result = new Date(source);
    const originalDay = result.getDate();

    result.setDate(1);
    result.setMonth(result.getMonth() + months);

    const lastDayOfTargetMonth = new Date(
      result.getFullYear(),
      result.getMonth() + 1,
      0
    ).getDate();

    result.setDate(Math.min(originalDay, lastDayOfTargetMonth));
    return result;
  }

  private calculateSubscriptionPeriod(
    billingCycle: BillingCycle,
    startAt: Date = new Date()
  ) {
    const currentPeriodStart = new Date(startAt);

    const currentPeriodEnd =
      billingCycle === "yearly"
        ? this.addCalendarMonths(currentPeriodStart, 12)
        : billingCycle === "termly"
          ? this.addCalendarMonths(currentPeriodStart, 4)
          : this.addCalendarMonths(currentPeriodStart, 1);

    return {
      currentPeriodStart,
      currentPeriodEnd,
      nextBillingDate: new Date(currentPeriodEnd),
    };
  }

  private subscriptionAmount(
    plan: {
      priceMonthly: number;
      priceTermly?: number | null;
      priceYearly: number;
    },
    billingCycle: BillingCycle
  ) {
    if (billingCycle === "yearly") {
      return Number(plan.priceYearly || 0);
    }

    if (billingCycle === "termly") {
      const configured = Number(plan.priceTermly || 0);
      return configured > 0
        ? configured
        : Number(plan.priceMonthly || 0) * 4;
    }

    return Number(plan.priceMonthly || 0);
  }

  /**
   * Normalizes plan prices before they are passed to Prisma.
   */
  private normalizePlanPrices(input: {
    priceMonthly?: number | null;
    priceTermly?: number | null;
    priceYearly?: number | null;
  }) {
    const normalize = (value: number | null | undefined) => {
      const parsed = Number(value ?? 0);

      if (!Number.isFinite(parsed)) {
        throw new BadRequestException(
          "Subscription plan prices must be valid numbers."
        );
      }

      return Math.max(0, Math.round(parsed));
    };

    return {
      ...(input.priceMonthly !== undefined
        ? { priceMonthly: normalize(input.priceMonthly) }
        : {}),
      ...(input.priceTermly !== undefined
        ? { priceTermly: normalize(input.priceTermly) }
        : {}),
      ...(input.priceYearly !== undefined
        ? { priceYearly: normalize(input.priceYearly) }
        : {}),
    };
  }

  private async createBillingEvent(data: {
    accountId: string;
    type: string;
    message: string;
    metadata?: any;
  }) {
    return this.prisma.billingEvent.create({
      data: {
        accountId: data.accountId,
        type: data.type,
        message: data.message,
        metadata: data.metadata || {},
      },
    });
  }

  private async activateSubscriptionFromPayment(paymentId: string) {
    const payment = await this.prisma.appPayment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: true,
        subscription: true,
        changeOrder: true,
      },
    });

    if (!payment) {
      throw new NotFoundException("Payment not found.");
    }

    if (payment.changeOrder) {
      await this.prisma.appPayment.update({
        where: { id: payment.id },
        data: { status: "paid", paidAt: payment.paidAt || new Date() },
      });
      if (payment.invoiceId) {
        await this.prisma.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            status: "paid",
            paidAt: payment.paidAt || new Date(),
            amountPaid: payment.amount,
            balance: 0,
          },
        });
      }
      return this.subscriptionChanges.applyPaidChangeOrder(
        payment.changeOrder.id,
      );
    }

    if (!payment.invoiceId || !payment.subscriptionId) {
      return payment;
    }

    await this.prisma.invoice.update({
      where: { id: payment.invoiceId },
      data: {
        status: "paid",
        paidAt: payment.paidAt || new Date(),
      },
    });

    const activationDate = payment.paidAt || new Date();
    const billingCycle = this.normalizeBillingCycle(
      payment.subscription?.billingCycle
    );
    const period = this.calculateSubscriptionPeriod(
      billingCycle,
      activationDate
    );

    await this.prisma.accountSubscription.update({
      where: { id: payment.subscriptionId },
      data: {
        status: "active",
        billingCycle,
        currentPeriodStart: period.currentPeriodStart,
        currentPeriodEnd: period.currentPeriodEnd,
        nextBillingDate: period.nextBillingDate,
        cancelledAt: null,
        cancelReason: null,
      },
    });

    await this.createBillingEvent({
      accountId: payment.accountId,
      type: "payment_received",
      message: `Payment received: ${payment.currency} ${payment.amount}`,
      metadata: {
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        subscriptionId: payment.subscriptionId,
        method: payment.method,
        provider: payment.provider,
        providerReference: payment.providerReference,
        receiptNumber: payment.receiptNumber,
        billingCycle,
        currentPeriodStart: period.currentPeriodStart,
        currentPeriodEnd: period.currentPeriodEnd,
        nextBillingDate: period.nextBillingDate,
        paystackMode: this.getPaystackMode(),
      },
    });

    return this.prisma.appPayment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: true,
        subscription: {
          include: {
            plan: true,
          },
        },
      },
    });
  }

  private async markPaymentPaid(
    paymentId: string,
    data?: {
      providerReference?: string;
      receiptNumber?: string;
      paidAt?: string | Date | null;
      note?: string;
      raw?: any;
    }
  ) {
    const existing = await this.prisma.appPayment.findUnique({
      where: { id: paymentId },
    });

    if (!existing) {
      throw new NotFoundException("Payment not found.");
    }

    if (existing.status === "paid") {
      return this.activateSubscriptionFromPayment(existing.id);
    }

    const paidAt = data?.paidAt
      ? new Date(data.paidAt)
      : new Date();

    const updated = await this.prisma.appPayment.update({
      where: { id: paymentId },
      data: {
        status: "paid",
        providerReference:
          data?.providerReference || existing.providerReference,
        receiptNumber:
          data?.receiptNumber ||
          existing.receiptNumber ||
          `RCT-${Date.now()}`,
        paidAt,
        note: data?.note || existing.note,
      },
    });

    return this.activateSubscriptionFromPayment(updated.id);
  }

  private async markPaymentFailed(
    paymentId: string,
    data?: {
      providerReference?: string;
      note?: string;
    }
  ) {
    const existing = await this.prisma.appPayment.findUnique({
      where: { id: paymentId },
    });

    if (!existing) {
      throw new NotFoundException("Payment not found.");
    }

    return this.prisma.appPayment.update({
      where: { id: paymentId },
      data: {
        status: "failed",
        providerReference:
          data?.providerReference || existing.providerReference,
        note:
          data?.note || existing.note || "Payment failed.",
      },
    });
  }

  // =====================================================
  // DASHBOARD
  // =====================================================

  async dashboard(actor: AuthUser) {
    if (isDeveloper(actor.role)) {
      const [
        accounts,
        subscriptions,
        invoices,
        payments,
        plans,
      ] = await Promise.all([
        this.prisma.account.count(),
        this.prisma.accountSubscription.count(),
        this.prisma.invoice.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { account: true },
        }),
        this.prisma.appPayment.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { account: true },
        }),
        this.prisma.subscriptionPlan.findMany({
          orderBy: { priceMonthly: "asc" },
        }),
      ]);

      return {
        scope: "platform",
        accounts,
        subscriptions,
        invoices,
        payments,
        plans,
        paystackMode: this.getPaystackMode(),
      };
    }

    const account = await this.prisma.account.findUnique({
      where: { id: actor.accountId },
      include: {
        subscription: { include: { plan: true } },
        invoices: { orderBy: { createdAt: "desc" } },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    return {
      scope: "account",
      account,
    };
  }

  // =====================================================
  // PLANS
  // =====================================================

  async listPlans(includeInactive = false) {
    return this.prisma.subscriptionPlan.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [
        { priceMonthly: "asc" },
        { name: "asc" },
      ],
    });
  }

  async createPlan(actor: AuthUser, dto: CreatePlanDto) {
    this.developerOnly(actor);

    const {
      metadata,
      features,
      ...planFields
    } = dto;

    const data: Prisma.SubscriptionPlanCreateInput = {
      ...planFields,
      ...this.normalizePlanPrices({
        priceMonthly: dto.priceMonthly,
        priceTermly: dto.priceTermly,
        priceYearly: dto.priceYearly,
      }),
      code: dto.code.toLowerCase().trim(),
      currency: dto.currency?.trim().toUpperCase() || "GHS",
      ...(features !== undefined
        ? {
            features: features as Prisma.InputJsonValue,
          }
        : {}),
      ...(metadata !== undefined
        ? {
            metadata: metadata as Prisma.InputJsonValue,
          }
        : {}),
    };

    return this.prisma.subscriptionPlan.create({
      data,
    });
  }

  async updatePlan(
    actor: AuthUser,
    id: string,
    dto: Partial<UpdatePlanDto>
  ) {
    this.developerOnly(actor);

    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException("Plan not found.");
    }

    const {
      metadata,
      features,
      ...planFields
    } = dto;

    const data: Prisma.SubscriptionPlanUpdateInput = {
      ...planFields,
      ...this.normalizePlanPrices({
        priceMonthly: dto.priceMonthly,
        priceTermly: dto.priceTermly,
        priceYearly: dto.priceYearly,
      }),
      ...(dto.code
        ? {
            code: dto.code.toLowerCase().trim(),
          }
        : {}),
      ...(dto.currency
        ? {
            currency: dto.currency.trim().toUpperCase(),
          }
        : {}),
      ...(features !== undefined
        ? {
            features: features as Prisma.InputJsonValue,
          }
        : {}),
      ...(metadata !== undefined
        ? {
            metadata: metadata as Prisma.InputJsonValue,
          }
        : {}),
    };

    return this.prisma.subscriptionPlan.update({
      where: { id },
      data,
    });
  }

  async deletePlan(actor: AuthUser, id: string) {
    this.developerOnly(actor);

    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: { active: false },
    });
  }

  // =====================================================
  // MY SUBSCRIPTION
  // =====================================================

  async mySubscription(actor: AuthUser) {
    if (!actor.accountId) {
      throw new BadRequestException(
        "Account ID is missing from logged-in user."
      );
    }

    return this.prisma.accountSubscription.findUnique({
      where: { accountId: actor.accountId },
      include: {
        plan: true,
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });
  }

  // =====================================================
  // SUBSCRIBE
  // =====================================================

  async subscribeToPlan(
    actor: AuthUser,
    dto: {
      planId: string;
      billingCycle?: string;
      paymentMethod?: PaymentMethod;
      provider?: string;
      payerName?: string;
      payerPhone?: string;
      payerEmail?: string;
      momoNetwork?: string;
    }
  ) {
    if (!actor.accountId) {
      throw new BadRequestException(
        "Account ID is missing from logged-in user."
      );
    }

    if (!dto.planId) {
      throw new BadRequestException("Plan ID is required.");
    }

    const billingCycle = this.normalizeBillingCycle(
      dto.billingCycle
    );

    const method = this.normalizePaymentMethod(dto.paymentMethod);
    const provider = this.normalizeProvider(dto.provider, method);

    if (provider === "paystack" && !dto.payerEmail) {
      throw new BadRequestException(
        "Payer email is required for Paystack payments."
      );
    }

    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: {
        id: dto.planId,
        active: true,
      },
    });

    if (!plan) {
      throw new NotFoundException("Active plan not found.");
    }

    const now = new Date();
    const period = this.calculateSubscriptionPeriod(
      billingCycle,
      now
    );
    const amount = this.subscriptionAmount(
      plan,
      billingCycle
    );

    const subscription =
      await this.prisma.accountSubscription.upsert({
        where: { accountId: actor.accountId },
        update: {
          planId: plan.id,
          billingCycle,
          status: amount > 0 ? "pending" : "active",
          currentPeriodStart: period.currentPeriodStart,
          currentPeriodEnd: period.currentPeriodEnd,
          nextBillingDate: period.nextBillingDate,
          cancelledAt: null,
          cancelReason: null,
        },
        create: {
          accountId: actor.accountId,
          planId: plan.id,
          billingCycle,
          status: amount > 0 ? "pending" : "active",
          currentPeriodStart: period.currentPeriodStart,
          currentPeriodEnd: period.currentPeriodEnd,
          nextBillingDate: period.nextBillingDate,
        },
        include: { plan: true },
      });

    if (amount <= 0) {
      await this.createBillingEvent({
        accountId: actor.accountId,
        type: "subscription_activated",
        message: `Free subscription activated: ${plan.name}`,
        metadata: {
          subscriptionId: subscription.id,
          planId: plan.id,
          billingCycle,
          currentPeriodStart: period.currentPeriodStart,
          currentPeriodEnd: period.currentPeriodEnd,
          nextBillingDate: period.nextBillingDate,
        },
      });

      return {
        subscription,
        requiresPayment: false,
        message: "Subscription activated successfully.",
      };
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        accountId: actor.accountId,
        subscriptionId: subscription.id,
        invoiceNumber: `INV-${Date.now()}`,
        currency: plan.currency || "GHS",
        subtotal: amount,
        discount: 0,
        tax: 0,
        total: amount,
        status: "issued",
        dueDate: period.currentPeriodEnd,
        note: `${plan.name} ${billingCycle} subscription`,
      },
    });

    const payment = await this.prisma.appPayment.create({
      data: {
        accountId: actor.accountId,
        subscriptionId: subscription.id,
        invoiceId: invoice.id,
        amount,
        currency: plan.currency || "GHS",
        method,
        provider,
        status: "pending",
        payerName: dto.payerName || null,
        payerPhone: dto.payerPhone || null,
        payerEmail: dto.payerEmail || null,
        note: `${plan.name} ${billingCycle} subscription payment`,
      },
    });

    let providerResponse: any = null;

    if (provider === "paystack") {
      providerResponse =
        await this.paymentProviderService.initializePayment({
          accountId: actor.accountId,
          amount,
          currency: plan.currency || "GHS",
          channel: method,
          provider: "paystack",
          paymentId: payment.id,
          invoiceId: invoice.id,
          subscriptionId: subscription.id,
          payerName: dto.payerName,
          payerPhone: dto.payerPhone,
          payerEmail: dto.payerEmail,
          callbackUrl: this.getPaystackCallbackUrl() || undefined,
          metadata: {
            paymentId: payment.id,
            planId: plan.id,
            billingCycle,
            momoNetwork: dto.momoNetwork,
            paystackMode: this.getPaystackMode(),
          },
        });

      await this.prisma.appPayment.update({
        where: { id: payment.id },
        data: {
          providerReference:
            providerResponse.providerReference,
        },
      });
    }

    return {
      subscription,
      invoice,
      payment,
      providerResponse,
      requiresPayment: true,
      authorizationUrl: providerResponse?.authorizationUrl,
      message:
        provider === "paystack"
          ? "Redirect user to Paystack."
          : "Manual payment pending.",
    };
  }

  // =====================================================
  // VERSION-ONE SUBSCRIPTION QUOTES / CHANGE ORDERS
  // =====================================================

  async createSubscriptionQuote(
  actor: AuthUser,
  dto: CreateSubscriptionQuoteDto,
) {
  if (!actor.accountId) {
    throw new BadRequestException(
      "Account ID is missing from logged-in user.",
    );
  }

  const toPlanId = dto.toPlanId ?? dto.planId;

  if (!toPlanId) {
    throw new BadRequestException(
      "A destination plan ID is required.",
    );
  }

  return this.subscriptionChanges.createQuote({
    accountId: actor.accountId,
    toPlanId,
    billingCycle: dto.billingCycle,
    changeType: dto.changeType,
    effectiveMode: dto.effectiveMode,
    privateOfferId: dto.privateOfferId,
    privateOfferCode: dto.privateOfferCode,
    pricingOverrideId: dto.pricingOverrideId,
    taxRatePercent: dto.taxRatePercent,
    requestedByUserId: actor.id,
  });
}

  getSubscriptionQuote(actor: AuthUser, id: string) {
    return this.subscriptionChanges.getForAccount(actor.accountId, id);
  }

  cancelSubscriptionQuote(actor: AuthUser, id: string) {
    return this.subscriptionChanges.cancel(actor.accountId, id);
  }

  async paySubscriptionQuote(
    actor: AuthUser,
    id: string,
    dto: PaySubscriptionChangeDto,
  ) {
    const order = await this.subscriptionChanges.getForAccount(actor.accountId, id);

    if (order.status !== "quoted") {
      throw new BadRequestException(`Quotation is ${order.status}.`);
    }
    if (order.quoteExpiresAt <= new Date()) {
      await this.prisma.subscriptionChangeOrder.update({
        where: { id: order.id },
        data: { status: "expired" },
      });
      throw new BadRequestException("Subscription quotation has expired.");
    }

    if (order.amountDue <= 0) {
      await this.prisma.subscriptionChangeOrder.update({
        where: { id: order.id },
        data: { status: "paid", paidAt: new Date() },
      });
      const applied = await this.subscriptionChanges.applyPaidChangeOrder(order.id, actor.id);
      return { changeOrder: applied, requiresPayment: false };
    }

    const method = this.normalizePaymentMethod(dto.paymentMethod);
    const provider = this.normalizeProvider(dto.provider, method);
    if (provider === "paystack" && !dto.payerEmail) {
      throw new BadRequestException("Payer email is required for Paystack payments.");
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        accountId: actor.accountId,
        subscriptionId: order.subscriptionId,
        invoiceNumber: `INV-${Date.now()}`,
        currency: order.currency,
        subtotal: order.baseAmount,
        discount: order.creditAmount + order.discountAmount,
        tax: order.taxAmount,
        total: order.amountDue,
        amountPaid: 0,
        balance: order.amountDue,
        status: "issued",
        dueDate: order.quoteExpiresAt,
        note: `${order.changeType} subscription change`,
        metadata: { changeOrderId: order.id },
      },
    });

    const payment = await this.prisma.appPayment.create({
      data: {
        accountId: actor.accountId,
        subscriptionId: order.subscriptionId,
        invoiceId: invoice.id,
        amount: order.amountDue,
        currency: order.currency,
        method,
        provider,
        status: "pending",
        payerName: dto.payerName || null,
        payerPhone: dto.payerPhone || null,
        payerEmail: dto.payerEmail || null,
        note: `${order.changeType} subscription payment`,
        metadata: { changeOrderId: order.id },
      },
    });

    await this.subscriptionChanges.markPaymentPending(order.id, invoice.id, payment.id);

    if (provider !== "paystack") {
      return { changeOrderId: order.id, invoice, payment, requiresPayment: true };
    }

    const providerResponse = await this.paymentProviderService.initializePayment({
      accountId: actor.accountId,
      amount: order.amountDue,
      currency: order.currency,
      channel: method,
      provider: "paystack",
      paymentId: payment.id,
      invoiceId: invoice.id,
      subscriptionId: order.subscriptionId || undefined,
      payerName: dto.payerName,
      payerPhone: dto.payerPhone,
      payerEmail: dto.payerEmail,
      momoNetwork: dto.momoNetwork,
      callbackUrl: this.getPaystackCallbackUrl() || undefined,
      metadata: {
        changeOrderId: order.id,
        paymentId: payment.id,
        billingCycle: order.billingCycle,
        changeType: order.changeType,
        paystackMode: this.getPaystackMode(),
      },
    });

    const refreshed = await this.prisma.appPayment.update({
      where: { id: payment.id },
      data: {
        providerReference: providerResponse.providerReference,
        authorizationUrl: providerResponse.authorizationUrl,
        accessCode: providerResponse.accessCode,
      },
    });

    return {
      changeOrderId: order.id,
      invoice,
      payment: refreshed,
      providerResponse,
      requiresPayment: true,
      authorizationUrl: providerResponse.authorizationUrl,
    };
  }

  // =====================================================
  // VERIFY PAYMENT
  // =====================================================

  async verifyPayment(
    actor: AuthUser,
    reference: string,
    provider: "paystack" | "manual" = "paystack"
  ) {
    if (!reference) {
      throw new BadRequestException(
        "Payment reference is required."
      );
    }

    const result =
      await this.paymentProviderService.verifyPayment(
        provider,
        reference
      );

    const payment = await this.prisma.appPayment.findFirst({
      where: { providerReference: reference },
    });

    if (!payment) {
      throw new NotFoundException("Payment record not found.");
    }

    assertSameAccountOrDeveloper(actor, payment.accountId);

    if (result.status === "paid") {
      return this.markPaymentPaid(payment.id, {
        providerReference:
          result.providerReference || reference,
        receiptNumber:
          result.receiptNumber || payment.receiptNumber || undefined,
        paidAt: result.paidAt || new Date(),
        raw: result.raw,
      });
    }

    if (result.status === "failed") {
      await this.markPaymentFailed(payment.id, {
        providerReference:
          result.providerReference || reference,
        note: "Payment verification failed.",
      });
    }

    return {
      payment,
      verification: result,
    };
  }

  // =====================================================
  // PAYSTACK WEBHOOK
  // =====================================================

  async handlePaystackWebhook(signature: string, body: any) {
    this.verifyPaystackSignature(signature, body);

    const event = body?.event;
    const data = body?.data;
    const reference = data?.reference;

    if (!event || !reference) {
      return {
        ok: true,
        ignored: true,
        reason: "Missing event or reference.",
      };
    }

    const payment = await this.prisma.appPayment.findFirst({
      where: { providerReference: reference },
    });

    if (!payment) {
      return {
        ok: true,
        ignored: true,
        reason: "Payment record not found locally.",
      };
    }

    if (event === "charge.success") {
      await this.markPaymentPaid(payment.id, {
        providerReference: reference,
        receiptNumber:
          data?.receipt_number || payment.receiptNumber || undefined,
        paidAt: data?.paid_at || new Date(),
        note: payment.note || undefined,
        raw: data,
      });

      return {
        ok: true,
        status: "paid",
      };
    }

    if (
      event === "charge.failed" ||
      event === "charge.dispute.create"
    ) {
      await this.markPaymentFailed(payment.id, {
        providerReference: reference,
        note:
          data?.gateway_response ||
          "Paystack reported payment failure.",
      });

      return {
        ok: true,
        status: "failed",
      };
    }

    return {
      ok: true,
      ignored: true,
      event,
    };
  }

  // =====================================================
  // PAYMENT INIT
  // =====================================================

  async initiatePayment(
    actor: AuthUser,
    dto: {
      invoiceId?: string;
      paymentId?: string;
      method: PaymentMethod;
      provider?: string;
      payerName?: string;
      payerPhone?: string;
      payerEmail?: string;
      note?: string;
    }
  ) {
    const method = this.normalizePaymentMethod(dto.method);
    const provider = this.normalizeProvider(dto.provider, method);

    if (!dto.invoiceId && !dto.paymentId) {
      throw new BadRequestException(
        "Provide either invoiceId or paymentId."
      );
    }

    let payment = dto.paymentId
      ? await this.prisma.appPayment.findUnique({
          where: { id: dto.paymentId },
          include: {
            invoice: true,
            subscription: { include: { plan: true } },
          },
        })
      : null;

    if (payment) {
      assertSameAccountOrDeveloper(actor, payment.accountId);

      const updated = await this.prisma.appPayment.update({
        where: { id: payment.id },
        data: {
          method,
          provider,
          payerName: dto.payerName || payment.payerName,
          payerPhone: dto.payerPhone || payment.payerPhone,
          payerEmail: dto.payerEmail || payment.payerEmail,
          note: dto.note || payment.note,
          status: "pending",
        },
        include: {
          invoice: true,
          subscription: { include: { plan: true } },
        },
      });

      if (provider !== "paystack") {
        return {
          payment: updated,
          requiresPayment: true,
          message: "Manual payment pending.",
        };
      }

      if (!updated.payerEmail) {
        throw new BadRequestException(
          "Payer email is required for Paystack payments."
        );
      }

      const providerResponse =
        await this.paymentProviderService.initializePayment({
          accountId: updated.accountId,
          amount: updated.amount,
          currency: updated.currency,
          channel: method,
          provider: "paystack",
          paymentId: updated.id,
          invoiceId: updated.invoiceId || undefined,
          subscriptionId: updated.subscriptionId || undefined,
          payerName: updated.payerName || undefined,
          payerPhone: updated.payerPhone || undefined,
          payerEmail: updated.payerEmail,
          callbackUrl: this.getPaystackCallbackUrl() || undefined,
          metadata: {
            paymentId: updated.id,
            paystackMode: this.getPaystackMode(),
          },
        });

      const refreshed = await this.prisma.appPayment.update({
        where: { id: updated.id },
        data: {
          providerReference:
            providerResponse.providerReference,
        },
        include: {
          invoice: true,
          subscription: { include: { plan: true } },
        },
      });

      return {
        payment: refreshed,
        providerResponse,
        requiresPayment: true,
        authorizationUrl: providerResponse.authorizationUrl,
        message: "Redirect user to Paystack.",
      };
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: dto.invoiceId },
      include: { subscription: true },
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found.");
    }

    assertSameAccountOrDeveloper(actor, invoice.accountId);

    payment = await this.prisma.appPayment.create({
      data: {
        accountId: invoice.accountId,
        subscriptionId: invoice.subscriptionId,
        invoiceId: invoice.id,
        amount: invoice.total,
        currency: invoice.currency,
        method,
        provider,
        status: "pending",
        payerName: dto.payerName || null,
        payerPhone: dto.payerPhone || null,
        payerEmail: dto.payerEmail || null,
        note:
          dto.note ||
          `Payment initiated for invoice ${invoice.invoiceNumber}`,
      },
      include: {
        invoice: true,
        subscription: { include: { plan: true } },
      },
    });

    if (provider !== "paystack") {
      return {
        payment,
        requiresPayment: true,
        message: "Manual payment pending.",
      };
    }

    if (!payment.payerEmail) {
      throw new BadRequestException(
        "Payer email is required for Paystack payments."
      );
    }

    const providerResponse =
      await this.paymentProviderService.initializePayment({
        accountId: payment.accountId,
        amount: payment.amount,
        currency: payment.currency,
        channel: method,
        provider: "paystack",
        paymentId: payment.id,
        invoiceId: payment.invoiceId || undefined,
        subscriptionId: payment.subscriptionId || undefined,
        payerName: payment.payerName || undefined,
        payerPhone: payment.payerPhone || undefined,
        payerEmail: payment.payerEmail,
        callbackUrl: this.getPaystackCallbackUrl() || undefined,
        metadata: {
          paymentId: payment.id,
          paystackMode: this.getPaystackMode(),
        },
      });

    const refreshed = await this.prisma.appPayment.update({
      where: { id: payment.id },
      data: {
        providerReference: providerResponse.providerReference,
      },
      include: {
        invoice: true,
        subscription: { include: { plan: true } },
      },
    });

    return {
      payment: refreshed,
      providerResponse,
      requiresPayment: true,
      authorizationUrl: providerResponse.authorizationUrl,
      message: "Redirect user to Paystack.",
    };
  }

  // =====================================================
  // MANUAL PAYMENT STATUS ACTIONS
  // =====================================================

  async confirmPayment(
    actor: AuthUser,
    id: string,
    dto: {
      providerReference?: string;
      receiptNumber?: string;
      note?: string;
      paidAt?: string;
    }
  ) {
    const existing = await this.prisma.appPayment.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException("Payment not found.");
    }

    assertSameAccountOrDeveloper(actor, existing.accountId);

    return this.markPaymentPaid(existing.id, {
      providerReference:
        dto.providerReference || existing.providerReference || undefined,
      receiptNumber: dto.receiptNumber || existing.receiptNumber || undefined,
      paidAt: dto.paidAt || new Date(),
      note: dto.note || existing.note || undefined,
    });
  }

  async failPayment(
    actor: AuthUser,
    id: string,
    dto: {
      note?: string;
      providerReference?: string;
    }
  ) {
    const existing = await this.prisma.appPayment.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException("Payment not found.");
    }

    assertSameAccountOrDeveloper(actor, existing.accountId);

    return this.markPaymentFailed(existing.id, {
      providerReference:
        dto.providerReference || existing.providerReference || undefined,
      note: dto.note || existing.note || "Payment failed.",
    });
  }

  async cancelPayment(
    actor: AuthUser,
    id: string,
    dto: { note?: string }
  ) {
    const existing = await this.prisma.appPayment.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException("Payment not found.");
    }

    assertSameAccountOrDeveloper(actor, existing.accountId);

    return this.prisma.appPayment.update({
      where: { id },
      data: {
        status: "cancelled",
        note:
          dto.note || existing.note || "Payment cancelled.",
      },
    });
  }

  // =====================================================
  // SUBSCRIPTIONS
  // =====================================================

  async listSubscriptions(actor: AuthUser, accountId?: string) {
    if (isDeveloper(actor.role)) {
      return this.prisma.accountSubscription.findMany({
        where: accountId ? { accountId } : {},
        include: {
          account: true,
          plan: true,
        },
        orderBy: { updatedAt: "desc" },
      });
    }

    return this.prisma.accountSubscription.findMany({
      where: { accountId: actor.accountId },
      include: { plan: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  async createSubscription(
    actor: AuthUser,
    dto: CreateSubscriptionDto
  ) {
    this.developerOnly(actor);

    return this.prisma.accountSubscription.upsert({
      where: { accountId: dto.accountId },
      update: {
        planId: dto.planId,
        status: dto.status || "active",
        billingCycle: dto.billingCycle || "monthly",
      },
      create: {
        accountId: dto.accountId,
        planId: dto.planId,
        status: dto.status || "active",
        billingCycle: dto.billingCycle || "monthly",
      },
      include: {
        account: true,
        plan: true,
      },
    });
  }

  async updateSubscription(
    actor: AuthUser,
    id: string,
    dto: UpdateSubscriptionDto
  ) {
    this.developerOnly(actor);

    return this.prisma.accountSubscription.update({
      where: { id },
      data: { ...dto },
    });
  }

  // =====================================================
  // INVOICES
  // =====================================================

  async listInvoices(actor: AuthUser, accountId?: string) {
    const target = accountId || actor.accountId;

    assertSameAccountOrDeveloper(actor, target);

    return this.prisma.invoice.findMany({
      where: { accountId: target },
      include: { payments: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async createInvoice(actor: AuthUser, dto: CreateInvoiceDto) {
    assertSameAccountOrDeveloper(actor, dto.accountId);

    const total =
      Number(dto.subtotal || 0) -
      Number(dto.discount || 0) +
      Number(dto.tax || 0);

    return this.prisma.invoice.create({
      data: {
        accountId: dto.accountId,
        subscriptionId: dto.subscriptionId,
        invoiceNumber: dto.invoiceNumber || `INV-${Date.now()}`,
        currency: dto.currency || "GHS",
        subtotal: dto.subtotal,
        discount: dto.discount || 0,
        tax: dto.tax || 0,
        total,
        status: dto.status || "draft",
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        note: dto.note,
      },
    });
  }

  async updateInvoice(
    actor: AuthUser,
    id: string,
    dto: UpdateInvoiceDto
  ) {
    const existing = await this.prisma.invoice.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException("Invoice not found.");
    }

    assertSameAccountOrDeveloper(actor, existing.accountId);

    return this.prisma.invoice.update({
      where: { id },
      data: { ...dto },
    });
  }

  // =====================================================
  // PAYMENTS
  // =====================================================

  async listPayments(actor: AuthUser, accountId?: string) {
    const target = accountId || actor.accountId;

    assertSameAccountOrDeveloper(actor, target);

    return this.prisma.appPayment.findMany({
      where: { accountId: target },
      include: { invoice: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async createPayment(actor: AuthUser, dto: CreatePaymentDto) {
    assertSameAccountOrDeveloper(actor, dto.accountId);

    return this.prisma.appPayment.create({
      data: { ...dto },
    });
  }

  async updatePayment(
    actor: AuthUser,
    id: string,
    dto: UpdatePaymentDto
  ) {
    const existing = await this.prisma.appPayment.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException("Payment not found.");
    }

    assertSameAccountOrDeveloper(actor, existing.accountId);

    return this.prisma.appPayment.update({
      where: { id },
      data: { ...dto },
    });
  }
}
