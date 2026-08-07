import { Injectable } from "@nestjs/common";
import { EntitlementResolverService } from "./entitlement-resolver.service";
import { EntitlementPolicyService } from "./entitlement-policy.service";
import { UsageService } from "./usage.service";
import {
  EntitlementUnavailableException,
  FeatureUnavailableException,
  ResourceLimitExceededException,
} from "./types/entitlement.errors";
import type {
  EffectiveAccess,
  EntitlementFeatureKey,
  EntitlementResourceKey,
} from "./types/entitlement.types";

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly resolver: EntitlementResolverService,
    private readonly policy: EntitlementPolicyService,
    private readonly usageService: UsageService,
  ) {}

  async getAccess(
    accountId: string,
    options?: {
      rebuild?: boolean;
      refreshUsage?: boolean;
    },
  ): Promise<EffectiveAccess> {
    const snapshot = options?.rebuild
      ? await this.resolver.rebuild(accountId)
      : await this.resolver.resolveSnapshot(
          accountId,
        );

    if (!snapshot) {
      throw new EntitlementUnavailableException();
    }

    const usage = await this.usageService.get(
      accountId,
      options?.refreshUsage ?? false,
    );

    return this.policy.createAccess(
      snapshot,
      usage,
    );
  }

  async assertFeature(
    accountId: string,
    feature: EntitlementFeatureKey,
  ): Promise<EffectiveAccess> {
    const access = await this.getAccess(accountId);

    if (!access.can(feature)) {
      throw new FeatureUnavailableException(
        feature,
      );
    }

    return access;
  }

  async assertResource(
    accountId: string,
    resource: EntitlementResourceKey,
    increase = 1,
  ): Promise<EffectiveAccess> {
    const access = await this.getAccess(accountId, {
      refreshUsage: true,
    });

    if (!access.hasCapacity(resource, increase)) {
      throw new ResourceLimitExceededException(
        resource,
        access.used(resource),
        access.limit(resource),
        increase,
      );
    }

    return access;
  }

  async rebuild(
    accountId: string,
  ): Promise<EffectiveAccess> {
    const snapshot =
      await this.resolver.rebuild(accountId);

    if (!snapshot) {
      throw new EntitlementUnavailableException();
    }

    const usage =
      await this.usageService.calculate(
        accountId,
      );

    return this.policy.createAccess(
      snapshot,
      usage,
    );
  }
}
