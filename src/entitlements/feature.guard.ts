import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthUser } from "../common/auth-user";
import { REQUIRE_FEATURE_KEY } from "./types/entitlement.constants";
import type { EntitlementFeatureKey } from "./types/entitlement.types";
import { EntitlementsService } from "./entitlements.service";

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const feature =
      this.reflector.getAllAndOverride<
        EntitlementFeatureKey
      >(REQUIRE_FEATURE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

    if (!feature) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser }>();

    const accountId = request.user?.accountId;

    if (!accountId) return false;

    await this.entitlements.assertFeature(
      accountId,
      feature,
    );

    return true;
  }
}
