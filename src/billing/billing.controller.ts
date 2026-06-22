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

// =====================================================
// PUBLIC PAYSTACK WEBHOOK CONTROLLER
// =====================================================
// Important:
// This controller must NOT use JwtAuthGuard.
// Paystack will not send your app JWT token.
// Security must be handled inside billingService.handlePaystackWebhook()
// by verifying x-paystack-signature.

@Controller("billing")
export class BillingWebhookController {
  constructor(
    private readonly billingService: BillingService
  ) {}

  @Post("webhooks/paystack")
  paystackWebhook(
    @Headers("x-paystack-signature")
    signature: string,

    @Body()
    body: any
  ) {
    return this.billingService.handlePaystackWebhook(
      signature,
      body
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
    private readonly billingService: BillingService
  ) {}

  // =====================================================
  // DASHBOARD
  // =====================================================

  @Get("dashboard")
  dashboard(@Req() req: any) {
    return this.billingService.dashboard(
      req.user
    );
  }

  // =====================================================
  // PLANS
  // =====================================================

  @Get("plans")
  plans(
    @Query("includeInactive")
    includeInactive?: string
  ) {
    return this.billingService.listPlans(
      includeInactive === "true"
    );
  }

  @Post("plans")
  createPlan(
    @Req() req: any,
    @Body() dto: CreatePlanDto
  ) {
    return this.billingService.createPlan(
      req.user,
      dto
    );
  }

  @Patch("plans/:id")
  updatePlan(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    dto: Partial<UpdatePlanDto>
  ) {
    return this.billingService.updatePlan(
      req.user,
      id,
      dto
    );
  }

  @Delete("plans/:id")
  deletePlan(
    @Req() req: any,
    @Param("id") id: string
  ) {
    return this.billingService.deletePlan(
      req.user,
      id
    );
  }

  // =====================================================
  // MY SUBSCRIPTION
  // =====================================================

  @Get("my-subscription")
  mySubscription(@Req() req: any) {
    return this.billingService.mySubscription(
      req.user
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

      billingCycle?: string;

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
    }
  ) {
    return this.billingService.subscribeToPlan(
      req.user,
      dto
    );
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
    }
  ) {
    return this.billingService.initiatePayment(
      req.user,
      dto
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
    provider?: "paystack" | "manual"
  ) {
    return this.billingService.verifyPayment(
      req.user,
      reference,
      provider || "paystack"
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
    }
  ) {
    return this.billingService.confirmPayment(
      req.user,
      id,
      dto
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
    }
  ) {
    return this.billingService.failPayment(
      req.user,
      id,
      dto
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
    }
  ) {
    return this.billingService.cancelPayment(
      req.user,
      id,
      dto
    );
  }

  // =====================================================
  // SUBSCRIPTIONS
  // =====================================================

  @Get("subscriptions")
  subscriptions(
    @Req() req: any,

    @Query("accountId")
    accountId?: string
  ) {
    return this.billingService.listSubscriptions(
      req.user,
      accountId
    );
  }

  @Post("subscriptions")
  createSubscription(
    @Req() req: any,

    @Body()
    dto: CreateSubscriptionDto
  ) {
    return this.billingService.createSubscription(
      req.user,
      dto
    );
  }

  @Patch("subscriptions/:id")
  updateSubscription(
    @Req() req: any,

    @Param("id") id: string,

    @Body()
    dto: UpdateSubscriptionDto
  ) {
    return this.billingService.updateSubscription(
      req.user,
      id,
      dto
    );
  }

  // =====================================================
  // INVOICES
  // =====================================================

  @Get("invoices")
  invoices(
    @Req() req: any,

    @Query("accountId")
    accountId?: string
  ) {
    return this.billingService.listInvoices(
      req.user,
      accountId
    );
  }

  @Post("invoices")
  createInvoice(
    @Req() req: any,

    @Body()
    dto: CreateInvoiceDto
  ) {
    return this.billingService.createInvoice(
      req.user,
      dto
    );
  }

  @Patch("invoices/:id")
  updateInvoice(
    @Req() req: any,

    @Param("id") id: string,

    @Body()
    dto: UpdateInvoiceDto
  ) {
    return this.billingService.updateInvoice(
      req.user,
      id,
      dto
    );
  }

  // =====================================================
  // PAYMENTS
  // =====================================================

  @Get("payments")
  payments(
    @Req() req: any,

    @Query("accountId")
    accountId?: string
  ) {
    return this.billingService.listPayments(
      req.user,
      accountId
    );
  }

  @Post("payments")
  createPayment(
    @Req() req: any,

    @Body()
    dto: CreatePaymentDto
  ) {
    return this.billingService.createPayment(
      req.user,
      dto
    );
  }

  @Patch("payments/:id")
  updatePayment(
    @Req() req: any,

    @Param("id") id: string,

    @Body()
    dto: UpdatePaymentDto
  ) {
    return this.billingService.updatePayment(
      req.user,
      id,
      dto
    );
  }
}