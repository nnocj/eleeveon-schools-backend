import { ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "./auth-user";
import { isDeveloper, normalizeRole } from "./roles";

export function assertSameAccountOrDeveloper(user: AuthUser, accountId?: string | null) {
  if (isDeveloper(user.role)) return;
  if (!accountId || accountId !== user.accountId) {
    throw new ForbiddenException("You can only access data inside your own account.");
  }
}

export function userCanAccessSchoolBranch(args: {
  user: AuthUser;
  role?: string | null;
  schoolId?: number | null;
  branchId?: number | null;
}) {
  const role = normalizeRole(args.role || args.user.role);
  if (!role) return false;
  if (role === "developer" || role === "platform_team" || role === "owner" || role === "super_admin") return true;

  const memberships = args.user.memberships || [];
  return memberships.some((membership) => {
    if (membership.active === false) return false;
    if (normalizeRole(membership.role) !== role) return false;

    const schoolMatches =
      !args.schoolId || !membership.schoolId || Number(membership.schoolId) === Number(args.schoolId);
    const branchMatches =
      !args.branchId || !membership.branchId || Number(membership.branchId) === Number(args.branchId);

    return schoolMatches && branchMatches;
  });
}
