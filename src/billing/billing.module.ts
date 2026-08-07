import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { AuthModule } from "../auth/auth.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";

import {
  BillingController,
  PublicBillingController,
} from "./billing.controller";
import { SubscriptionController } from "./subscription.controller";
import { PrivateOffersController } from "./private-offers.controller";
import { PricingOverridesController } from "./pricing-overrides.controller";

import { BillingService } from "./billing.service";

import { PaymentProviderService } from "./payment-providers/payment-provider.service";
import { ManualProvider } from "./payment-providers/providers/manual.provider";
import { PaystackProvider } from "./payment-providers/providers/paystack.provider";

import { SubscriptionCalculatorService } from "./subscription-calculator.service";
import { SubscriptionPeriodService } from "./subscription-period.service";
import { SubscriptionChangeService } from "./subscription-change.service";
import { SubscriptionRenewalService } from "./subscription-renewal.service";
import { SubscriptionReconciliationService } from "./subscription-reconciliation.service";
import { SubscriptionJobsService } from "./subscription-jobs.service";

import { PricingResolutionService } from "./pricing-resolution.service";

import { PrivateOffersService } from "./private-offers.service";
import { PricingOverridesService } from "./pricing-overrides.service";

@Module({
  imports: [
    AuthModule,
    EntitlementsModule,
    ScheduleModule.forRoot(),
  ],

  controllers: [
    PublicBillingController,
    BillingController,
    SubscriptionController,
    PrivateOffersController,
    PricingOverridesController,
  ],

  providers: [
    BillingService,

    PaymentProviderService,
    ManualProvider,
    PaystackProvider,

    SubscriptionCalculatorService,
    SubscriptionPeriodService,
    SubscriptionChangeService,
    SubscriptionRenewalService,
    SubscriptionReconciliationService,
    SubscriptionJobsService,

    PricingResolutionService,
    PrivateOffersService,
    PricingOverridesService,
  ],

  exports: [
    BillingService,

    PaymentProviderService,

    SubscriptionCalculatorService,
    SubscriptionPeriodService,
    SubscriptionChangeService,
    SubscriptionRenewalService,
    SubscriptionReconciliationService,

    PricingResolutionService,
    PrivateOffersService,
    PricingOverridesService,
  ],
})
export class BillingModule {}