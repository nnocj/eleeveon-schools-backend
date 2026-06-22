import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";

import {
  PaymentProvider,
  StartPaymentInput,
  StartPaymentResult,
  VerifyPaymentResult,
} from "../payment-provider.types";

@Injectable()
export class PaystackProvider implements PaymentProvider {
  private readonly nodeEnv =
    process.env.NODE_ENV || "development";

  private readonly paystackMode =
    process.env.PAYSTACK_MODE ||
    (this.nodeEnv === "production"
      ? "live"
      : "test");

  private readonly secretKey =
    this.paystackMode === "live"
      ? process.env.PAYSTACK_LIVE_SECRET_KEY ||
        process.env.PAYSTACK_SECRET_KEY ||
        ""
      : process.env.PAYSTACK_TEST_SECRET_KEY ||
        process.env.PAYSTACK_SECRET_KEY ||
        "";

  private readonly callbackUrl =
    this.paystackMode === "live"
      ? process.env.PAYSTACK_LIVE_CALLBACK_URL ||
        process.env.PAYSTACK_CALLBACK_URL ||
        ""
      : process.env.PAYSTACK_TEST_CALLBACK_URL ||
        process.env.PAYSTACK_CALLBACK_URL ||
        "";

  private readonly baseUrl =
    "https://api.paystack.co";

  private headers() {
    if (!this.secretKey) {
      throw new BadRequestException(
        `Paystack ${this.paystackMode} secret key is missing.`
      );
    }

    if (
      this.paystackMode === "live" &&
      !this.secretKey.startsWith("sk_live_")
    ) {
      throw new BadRequestException(
        "Invalid Paystack live secret key. Expected sk_live_ key."
      );
    }

    if (
      this.paystackMode === "test" &&
      !this.secretKey.startsWith("sk_test_")
    ) {
      throw new BadRequestException(
        "Invalid Paystack test secret key. Expected sk_test_ key."
      );
    }

    return {
      Authorization: `Bearer ${this.secretKey}`,
      "Content-Type": "application/json",
    };
  }

  async initializePayment(
    payload: StartPaymentInput
  ): Promise<StartPaymentResult> {
    if (!payload.payerEmail) {
      throw new BadRequestException(
        "payerEmail is required for Paystack payments."
      );
    }

    if (!payload.amount || Number(payload.amount) <= 0) {
      throw new BadRequestException(
        "A valid payment amount is required."
      );
    }

    const reference =
      payload.paymentId ||
      `PAY-${Date.now()}`;

    const body: any = {
      email: payload.payerEmail,
      amount: Math.round(
        Number(payload.amount) * 100
      ),
      currency: payload.currency || "GHS",
      reference,
      metadata: {
        accountId: payload.accountId,
        invoiceId: payload.invoiceId,
        subscriptionId:
          payload.subscriptionId,
        payerName: payload.payerName,
        payerPhone: payload.payerPhone,
        channel: payload.channel,
        mode: this.paystackMode,
        ...payload.metadata,
      },
    };

    const finalCallbackUrl =
      payload.callbackUrl ||
      this.callbackUrl;

    if (finalCallbackUrl) {
      body.callback_url = finalCallbackUrl;
    }

    if (payload.channel === "momo") {
      body.channels = ["mobile_money"];
    }

    if (payload.channel === "card") {
      body.channels = ["card"];
    }

    if (payload.channel === "bank") {
      body.channels = ["bank"];
    }

    const response = await fetch(
      `${this.baseUrl}/transaction/initialize`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      }
    );

    const json = await response.json();

    if (!response.ok || !json?.status) {
      throw new BadRequestException(
        json?.message ||
          "Unable to initialize Paystack payment."
      );
    }

    return {
      success: true,
      status: "requires_customer_action",
      provider: "paystack",
      providerReference:
        json?.data?.reference,
      authorizationUrl:
        json?.data?.authorization_url,
      accessCode:
        json?.data?.access_code,
      message:
        "Payment initialized successfully.",
      raw: json,
    };
  }

  async verifyPayment(
    reference: string
  ): Promise<VerifyPaymentResult> {
    if (!reference) {
      throw new BadRequestException(
        "Payment reference is required."
      );
    }

    const response = await fetch(
      `${this.baseUrl}/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: this.headers(),
      }
    );

    const json = await response.json();

    if (!response.ok) {
      throw new BadRequestException(
        json?.message ||
          "Unable to verify payment."
      );
    }

    const paid =
      json?.data?.status === "success";

    return {
      success: paid,
      status: paid ? "paid" : "failed",
      providerReference:
        json?.data?.reference,
      paidAt: json?.data?.paid_at,
      raw: json,
      message: paid
        ? "Payment verified successfully."
        : "Payment verification failed.",
    };
  }
}