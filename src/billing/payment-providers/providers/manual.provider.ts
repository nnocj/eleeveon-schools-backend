import { Injectable } from "@nestjs/common";

import {
  PaymentProvider,
  StartPaymentInput,
  StartPaymentResult,
  VerifyPaymentResult,
} from "../payment-provider.types";

@Injectable()
export class ManualProvider implements PaymentProvider {
  async initializePayment(
    payload: StartPaymentInput
  ): Promise<StartPaymentResult> {
    return {
      success: true,
      status: "pending",
      provider: "manual",
      providerReference: `MANUAL-${Date.now()}`,
      message:
        "Manual payment initiated. Awaiting admin confirmation.",
      raw: payload,
    };
  }

  async verifyPayment(
    reference: string
  ): Promise<VerifyPaymentResult> {
    return {
      success: true,
      status: "pending",
      providerReference: reference,
      message:
        "Manual payments are verified internally by admin.",
    };
  }
}