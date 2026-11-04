import { ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "../common/auth-user";
import { isDeveloper } from "../common/roles";

/** Do not trust actor IDs or roles supplied in JSON bodies. Actor must come from JwtAuthGuard. */
export function requireCommercialOperator(actor?: AuthUser): asserts actor is AuthUser {
  if (!actor || !isDeveloper(actor.role) || actor.active === false ||
      !actor.memberships?.some(m => m.active !== false && m.role === actor.role && m.accountId === actor.accountId)) {
    throw new ForbiddenException("Eleeveon platform commercial operator required.");
  }
}
