export type AppRole =
  | "developer"
  | "platform_team"
  | "owner"
  | "super_admin"
  | "branch_admin"
  | "admin"
  | "teacher"
  | "student"
  | "accountant"
  | "parent";

export const ALL_APP_ROLES: AppRole[] = [
  "developer",
  "platform_team",
  "owner",
  "super_admin",
  "branch_admin",
  "admin",
  "teacher",
  "student",
  "accountant",
  "parent",
];

export const DEVELOPER_ROLES: AppRole[] = [
  "developer",
  "platform_team",
];

export const OWNER_ROLES: AppRole[] = [
  "owner",
  "super_admin",
];

export const SCHOOL_ADMIN_ROLES: AppRole[] = [
  "admin",
];

export const BRANCH_ADMIN_ROLES: AppRole[] = [
  "branch_admin",
];

export const ACCOUNTANT_ROLES: AppRole[] = [
  "accountant",
];

export const ADMIN_ROLES: AppRole[] = [
  "owner",
  "super_admin",
  "admin",
  "branch_admin",
];

export const FINANCE_ROLES: AppRole[] = [
  "owner",
  "super_admin",
  "admin",
  "branch_admin",
  "accountant",
];

export const TEACHER_ROLES: AppRole[] = [
  "teacher",
];

export const STUDENT_ROLES: AppRole[] = [
  "student",
];

export const PARENT_ROLES: AppRole[] = [
  "parent",
];

/**
 * Converts historical and database role aliases into the canonical AppRole
 * names used by guards, decorators, and request actor types.
 *
 * Prisma currently stores the school-level administrator role as
 * "school_admin", while the existing AppRole contract uses "admin".
 */
export function normalizeRole(
  role?: string | null,
): AppRole | undefined {
  if (!role) return undefined;

  const value = role
    .trim()
    .toLowerCase();

  if (
    value === "school_owner" ||
    value === "account_owner"
  ) {
    return "owner";
  }

  if (value === "school_admin") {
    return "admin";
  }

  if (
    value === "appdeveloper" ||
    value === "app_developer"
  ) {
    return "developer";
  }

  return ALL_APP_ROLES.includes(
    value as AppRole,
  )
    ? (value as AppRole)
    : undefined;
}

export function roleIs(
  role: string | null | undefined,
  allowedRoles: readonly AppRole[],
): boolean {
  const normalized =
    normalizeRole(role);

  return Boolean(
    normalized &&
      allowedRoles.includes(
        normalized,
      ),
  );
}

export function isDeveloper(
  role?: string | null,
): boolean {
  const normalized =
    normalizeRole(role);

  return Boolean(
    normalized &&
      DEVELOPER_ROLES.includes(
        normalized,
      ),
  );
}

export function isOwner(
  role?: string | null,
): boolean {
  const normalized =
    normalizeRole(role);

  return Boolean(
    normalized &&
      OWNER_ROLES.includes(
        normalized,
      ),
  );
}

export function isAdminLike(
  role?: string | null,
): boolean {
  const normalized =
    normalizeRole(role);

  return Boolean(
    normalized &&
      ADMIN_ROLES.includes(
        normalized,
      ),
  );
}