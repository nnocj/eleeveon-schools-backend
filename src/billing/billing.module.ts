import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingController, PublicBillingController } from "./billing.controller";
import { PrivateOffersController } from "./private-offers.controller";
import { PricingOverridesController } from "./pricing-overrides.controller";
import { BillingService } from "./billing.service";
import { PaymentProviderService } from "./payment-providers/payment-provider.service";
import { ManualProvider } from "./payment-providers/providers/manual.provider";
import { PaystackProvider } from "./payment-providers/providers/paystack.provider";
import { SubscriptionCalculatorService } from "./subscription-calculator.service";
import { SubscriptionPeriodService } from "./subscription-period.service";
import { SubscriptionChangeService } from "./subscription-change.service";
import { PricingResolutionService } from "./pricing-resolution.service";
import { PrivateOffersService } from "./private-offers.service";
import { PricingOverridesService } from "./pricing-overrides.service";
import { SubscriptionJobsService } from "./subscription-jobs.service";
import { SubscriptionReconciliationService } from "./subscription-reconciliation.service";

@Module({
  imports: [AuthModule],
  controllers: [
    PublicBillingController,
    BillingController,
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
    PricingResolutionService,
    PrivateOffersService,
    PricingOverridesService,
    SubscriptionJobsService,
    SubscriptionReconciliationService,
  ],
  exports: [
    BillingService,
    PaymentProviderService,
    SubscriptionCalculatorService,
    SubscriptionPeriodService,
    SubscriptionChangeService,
    PricingResolutionService,
    PrivateOffersService,
    PricingOverridesService,
    SubscriptionJobsService,
    SubscriptionReconciliationService,
  ],
})
export class BillingModule {}
