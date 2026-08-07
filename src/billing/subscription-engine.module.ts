import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { SubscriptionCalculatorService } from "./subscription-calculator.service";
import { PricingResolutionService } from "./pricing-resolution.service";
import { SubscriptionPeriodService } from "./subscription-period.service";
import { SubscriptionChangeService } from "./subscription-change.service";
import { SubscriptionRenewalService } from "./subscription-renewal.service";
import { PrivateOffersService } from "./private-offers.service";
import { PrivateOffersController } from "./private-offers.controller";
import { PricingOverridesService } from "./pricing-overrides.service";
import { PricingOverridesController } from "./pricing-overrides.controller";
import { SubscriptionJobsService } from "./subscription-jobs.service";
import { SubscriptionReconciliationService } from "./subscription-reconciliation.service";
import { SubscriptionController } from "./subscription.controller";

@Module({
  imports: [
    EntitlementsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [
    SubscriptionController,
    PrivateOffersController,
    PricingOverridesController,
  ],
  providers: [
    SubscriptionCalculatorService,
    PricingResolutionService,
    SubscriptionPeriodService,
    SubscriptionChangeService,
    SubscriptionRenewalService,
    PrivateOffersService,
    PricingOverridesService,
    SubscriptionJobsService,
    SubscriptionReconciliationService,
  ],
  exports: [
    SubscriptionCalculatorService,
    PricingResolutionService,
    SubscriptionPeriodService,
    SubscriptionChangeService,
    SubscriptionRenewalService,
    PrivateOffersService,
    PricingOverridesService,
    SubscriptionReconciliationService,
  ],
})
export class SubscriptionEngineModule {}
