import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";

import { BillingService } from "./billing.service";

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
import { CreateSubscriptionQuoteDto } from "./dto/subscription-quote.dto";
import { PaySubscriptionChangeDto } from "./dto/subscription-change.dto";

// =====================================================
// PUBLIC BILLING CONTROLLER
// =====================================================
// Public-facing routes must stay outside the controller-level JWT guards.
//
// Public:
// - GET  /billing/plans
// - POST /billing/webhooks/paystack
//
// Protected:
// - every other billing route
//
// This allows the Eleeveon public homepage to load active prices without
// requiring a login token while keeping plan management and all account
// billing data protected.

@Controller("billing")
export class PublicBillingController {
  constructor(
    private readonly billingService: BillingService,
  ) {}

  /**
   * Public package catalogue.
   *
   * Only active plans are exposed publicly. The public endpoint deliberately
   * ignores includeInactive so visitors can never request unpublished plans.
   */
  @Get("plans")
  plans() {
    return this.billingService.listPlans(false);
  }

  /**
   * Paystack calls this route without an Eleeveon JWT.
   * Authenticity is verified in BillingService using x-paystack-signature.
   */
  @Post("webhooks/paystack")
  paystackWebhook(
    @Headers("x-paystack-signature")
    signature: string,
    @Body()
    body: any,
  ) {
    return this.billingService.handlePaystackWebhook(
      signature,
      body,
    );
  }
}

// =====================================================
// PROTECTED BILLING CONTROLLER
// =====================================================

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("billing")
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
  ) {}

  // =====================================================
  // DASHBOARD
  // =====================================================

  @Get("dashboard")
  dashboard(@Req() req: any) {
    return this.billingService.dashboard(
      req.user,
    );
  }

  // =====================================================
  // PLAN MANAGEMENT
  // =====================================================
  // The public GET /billing/plans route lives in PublicBillingController.
  // Protected plan creation, editing and deactivation remain here.

  /**
   * Developer/admin catalogue including inactive plans.
   *
   * This uses a different route from the public package catalogue so there is
   * no duplicate GET /billing/plans registration.
   */
  @Get("plans/manage")
  managePlans(
    @Query("includeInactive")
    includeInactive?: string,
  ) {
    return this.billingService.listPlans(
      includeInactive === "true",
    );
  }

  @Post("plans")
  createPlan(
    @Req() req: any,
    @Body() dto: CreatePlanDto,
  ) {
    return this.billingService.createPlan(
      req.user,
      dto,
    );
  }

  @Patch("plans/:id")
  updatePlan(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    dto: UpdatePlanDto,
  ) {
    return this.billingService.updatePlan(
      req.user,
      id,
      dto,
    );
  }

  @Delete("plans/:id")
  deletePlan(
    @Req() req: any,
    @Param("id") id: string,
  ) {
    return this.billingService.deletePlan(
      req.user,
      id,
    );
  }

  // =====================================================
  // MY SUBSCRIPTION
  // =====================================================

  @Get("my-subscription")
  mySubscription(@Req() req: any) {
    return this.billingService.mySubscription(
      req.user,
    );
  }

  // =====================================================
  // SUBSCRIBE
  // =====================================================

  @Post("subscribe")
  subscribe(
    @Req() req: any,
    @Body()
    dto: {
      planId: string;
      billingCycle?: "monthly" | "termly" | "yearly";

      paymentMethod?:
        | "momo"
        | "card"
        | "bank"
        | "cash"
        | "manual";

      provider?: "paystack" | "manual";
      payerName?: string;
      payerPhone?: string;
      payerEmail?: string;

      momoNetwork?:
        | "mtn"
        | "telecel"
        | "airteltigo";
    },
  ) {
    return this.billingService.subscribeToPlan(
      req.user,
      dto,
    );
  }

  // =====================================================
  // SUBSCRIPTION QUOTES / CHANGE ORDERS
  // =====================================================

  @Post("subscription-quotes")
  createSubscriptionQuote(
    @Req() req: any,
    @Body() dto: CreateSubscriptionQuoteDto,
  ) {
    return this.billingService.createSubscriptionQuote(req.user, dto);
  }

  @Get("subscription-quotes/:id")
  subscriptionQuote(
    @Req() req: any,
    @Param("id") id: string,
  ) {
    return this.billingService.getSubscriptionQuote(req.user, id);
  }

  @Post("subscription-quotes/:id/pay")
  paySubscriptionQuote(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: PaySubscriptionChangeDto,
  ) {
    return this.billingService.paySubscriptionQuote(req.user, id, dto);
  }

  @Post("subscription-quotes/:id/cancel")
  cancelSubscriptionQuote(
    @Req() req: any,
    @Param("id") id: string,
  ) {
    return this.billingService.cancelSubscriptionQuote(req.user, id);
  }

  // =====================================================
  // PAYMENT INIT
  // =====================================================

  @Post("payments/initiate")
  initiatePayment(
    @Req() req: any,
    @Body()
    dto: {
      invoiceId?: string;
      paymentId?: string;

      method:
        | "momo"
        | "card"
        | "bank"
        | "cash"
        | "manual";

      provider?: "paystack" | "manual";
      payerName?: string;
      payerPhone?: string;
      payerEmail?: string;

      momoNetwork?:
        | "mtn"
        | "telecel"
        | "airteltigo";

      note?: string;
    },
  ) {
    return this.billingService.initiatePayment(
      req.user,
      dto,
    );
  }

  // =====================================================
  // VERIFY
  // =====================================================

  @Get("payments/verify/:reference")
  verifyPayment(
    @Req() req: any,
    @Param("reference")
    reference: string,
    @Query("provider")
    provider?: "paystack" | "manual",
  ) {
    return this.billingService.verifyPayment(
      req.user,
      reference,
      provider || "paystack",
    );
  }

  // =====================================================
  // CONFIRM
  // =====================================================

  @Post("payments/:id/confirm")
  confirmPayment(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    dto: {
      providerReference?: string;
      receiptNumber?: string;
      note?: string;
      paidAt?: string;
    },
  ) {
    return this.billingService.confirmPayment(
      req.user,
      id,
      dto,
    );
  }

  // =====================================================
  // FAIL
  // =====================================================

  @Post("payments/:id/fail")
  failPayment(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    dto: {
      note?: string;
      providerReference?: string;
    },
  ) {
    return this.billingService.failPayment(
      req.user,
      id,
      dto,
    );
  }

  // =====================================================
  // CANCEL
  // =====================================================

  @Post("payments/:id/cancel")
  cancelPayment(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    dto: {
      note?: string;
    },
  ) {
    return this.billingService.cancelPayment(
      req.user,
      id,
      dto,
    );
  }

  // =====================================================
  // SUBSCRIPTIONS
  // =====================================================

  @Get("subscriptions")
  subscriptions(
    @Req() req: any,
    @Query("accountId")
    accountId?: string,
  ) {
    return this.billingService.listSubscriptions(
      req.user,
      accountId,
    );
  }

  @Post("subscriptions")
  createSubscription(
    @Req() req: any,
    @Body()
    dto: CreateSubscriptionDto,
  ) {
    return this.billingService.createSubscription(
      req.user,
      dto,
    );
  }

  @Patch("subscriptions/:id")
  updateSubscription(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    dto: UpdateSubscriptionDto,
  ) {
    return this.billingService.updateSubscription(
      req.user,
      id,
      dto,
    );
  }

  // =====================================================
  // INVOICES
  // =====================================================

  @Get("invoices")
  invoices(
    @Req() req: any,
    @Query("accountId")
    accountId?: string,
  ) {
    return this.billingService.listInvoices(
      req.user,
      accountId,
    );
  }

  @Post("invoices")
  createInvoice(
    @Req() req: any,
    @Body()
    dto: CreateInvoiceDto,
  ) {
    return this.billingService.createInvoice(
      req.user,
      dto,
    );
  }

  @Patch("invoices/:id")
  updateInvoice(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    dto: UpdateInvoiceDto,
  ) {
    return this.billingService.updateInvoice(
      req.user,
      id,
      dto,
    );
  }

  // =====================================================
  // PAYMENTS
  // =====================================================

  @Get("payments")
  payments(
    @Req() req: any,
    @Query("accountId")
    accountId?: string,
  ) {
    return this.billingService.listPayments(
      req.user,
      accountId,
    );
  }

  @Post("payments")
  createPayment(
    @Req() req: any,
    @Body()
    dto: CreatePaymentDto,
  ) {
    return this.billingService.createPayment(
      req.user,
      dto,
    );
  }

  @Patch("payments/:id")
  updatePayment(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    dto: UpdatePaymentDto,
  ) {
    return this.billingService.updatePayment(
      req.user,
      id,
      dto,
    );
  }
}
