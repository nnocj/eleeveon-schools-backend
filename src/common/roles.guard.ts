import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "./roles.decorator";
import { AppRole, isDeveloper, normalizeRole } from "./roles";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const role = normalizeRole(user?.role);

    if (!role) throw new ForbiddenException("Your session role is invalid.");
    if (isDeveloper(role)) return true;
    if (!required.includes(role)) {
      throw new ForbiddenException("You do not have permission to perform this action.");
    }

    return true;
  }
}
