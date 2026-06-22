import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";

import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

import { PaymentProviderService } from "./payment-providers/payment-provider.service";

import { ManualProvider } from "./payment-providers/providers/manual.provider";
import { PaystackProvider } from "./payment-providers/providers/paystack.provider";

@Module({
  imports: [AuthModule],

  controllers: [BillingController],

  providers: [
    BillingService,

    PaymentProviderService,

    ManualProvider,

    PaystackProvider,
  ],

  exports: [
    BillingService,
    PaymentProviderService,
  ],
})
export class BillingModule {}