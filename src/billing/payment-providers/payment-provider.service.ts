import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";

import {
  PaymentProviderName,
  StartPaymentInput,
} from "./payment-provider.types";

import { ManualProvider } from "./providers/manual.provider";
import { PaystackProvider } from "./providers/paystack.provider";

@Injectable()
export class PaymentProviderService {
  constructor(
    private readonly manualProvider: ManualProvider,
    private readonly paystackProvider: PaystackProvider
  ) {}

  private getProvider(
    provider: PaymentProviderName
  ) {
    switch (provider) {
      case "paystack":
        return this.paystackProvider;

      case "manual":
        return this.manualProvider;

      default:
        throw new BadRequestException(
          `Unsupported payment provider: ${provider}`
        );
    }
  }

  async initializePayment(
    payload: StartPaymentInput
  ) {
    const provider = this.getProvider(
      payload.provider
    );

    return provider.initializePayment(
      payload
    );
  }

  async verifyPayment(
    provider: PaymentProviderName,
    reference: string
  ) {
    const target = this.getProvider(provider);

    return target.verifyPayment(reference);
  }
}