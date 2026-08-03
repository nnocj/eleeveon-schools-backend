import type { AppRole } from "./roles";

/**
 * Lightweight authenticated membership attached to req.user.
 *
 * All school, branch, and linked-profile identifiers use the permanent
 * string IDs stored by Prisma and the synced frontend database.
 */
export type AuthMembership = {
  id: string;
  accountId: string;
  role: AppRole;

  schoolId?: string | null;
  branchId?: string | null;

  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;

  active?: boolean;
  status?: string | null;
  isDefault?: boolean;
};

/**
 * Authenticated actor available on protected backend requests.
 *
 * `role` remains for backward compatibility and represents the role currently
 * carried by the authenticated session. Authorization code that supports
 * multi-role users should also inspect `memberships`.
 */
export type AuthUser = {
  id: string;
  accountId: string;
  email: string;
  role: AppRole;

  fullName?: string;
  phone?: string | null;
  active?: boolean;

  memberships?: AuthMembership[];

  /**
   * Optional selected workspace/session context.
   * These fields allow the JWT/session layer to identify the exact membership
   * currently being used without relying only on AppUser.role.
   */
  activeMembershipId?: string | null;
  activeRole?: AppRole | null;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
};

export type AuthRequest = Request & {
  user: AuthUser;
};