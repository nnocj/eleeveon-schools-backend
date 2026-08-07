import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthUser } from "../common/auth-user";
import { REQUIRE_RESOURCE_KEY } from "./types/entitlement.constants";
import type { RequiredResourceMetadata } from "./decorators/require-resource.decorator";
import { EntitlementsService } from "./entitlements.service";

@Injectable()
export class ResourceLimitGuard
  implements CanActivate
{
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const requirement =
      this.reflector.getAllAndOverride<
        RequiredResourceMetadata
      >(REQUIRE_RESOURCE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

    if (!requirement) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser }>();

    const accountId = request.user?.accountId;

    if (!accountId) return false;

    await this.entitlements.assertResource(
      accountId,
      requirement.resource,
      requirement.increase,
    );

    return true;
  }
}
