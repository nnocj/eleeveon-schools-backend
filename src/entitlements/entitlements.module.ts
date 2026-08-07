import { Module } from "@nestjs/common";
import { EntitlementsController } from "./entitlements.controller";
import { EntitlementResolverService } from "./entitlement-resolver.service";
import { EntitlementsService } from "./entitlements.service";
import { EntitlementPolicyService } from "./entitlement-policy.service";
import { UsageService } from "./usage.service";
import { FeatureGuard } from "./feature.guard";
import { ResourceLimitGuard } from "./resource-limit.guard";

@Module({
  controllers: [EntitlementsController],
  providers: [
    EntitlementResolverService,
    EntitlementsService,
    EntitlementPolicyService,
    UsageService,
    FeatureGuard,
    ResourceLimitGuard,
  ],
  exports: [
    EntitlementResolverService,
    EntitlementsService,
    EntitlementPolicyService,
    UsageService,
    FeatureGuard,
    ResourceLimitGuard,
  ],
})
export class EntitlementsModule {}
