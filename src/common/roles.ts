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

export const DEVELOPER_ROLES: AppRole[] = ["developer", "platform_team"];
export const OWNER_ROLES: AppRole[] = ["owner", "super_admin"];
export const SCHOOL_ADMIN_ROLES: AppRole[] = ["admin"];
export const BRANCH_ADMIN_ROLES: AppRole[] = ["branch_admin"];
export const ACCOUNTANT_ROLES: AppRole[] = ["accountant"];
export const ADMIN_ROLES: AppRole[] = ["owner", "super_admin", "admin", "branch_admin"];
export const FINANCE_ROLES: AppRole[] = ["owner", "super_admin", "admin", "branch_admin", "accountant"];
export const TEACHER_ROLES: AppRole[] = ["teacher"];
export const STUDENT_ROLES: AppRole[] = ["student"];
export const PARENT_ROLES: AppRole[] = ["parent"];

export function normalizeRole(role?: string | null): AppRole | undefined {
  if (!role) return undefined;
  const value = role.trim().toLowerCase();

  // Backward compatibility: older accounts used super_admin as owner.
  if (value === "school_owner" || value === "account_owner") return "owner";

  return ALL_APP_ROLES.includes(value as AppRole) ? (value as AppRole) : undefined;
}

export function roleIs(role: string | null | undefined, allowedRoles: AppRole[]) {
  const normalized = normalizeRole(role);
  return Boolean(normalized && allowedRoles.includes(normalized));
}

export function isDeveloper(role?: string | null) {
  const normalized = normalizeRole(role);
  return normalized === "developer" || normalized === "platform_team";
}

export function isOwner(role?: string | null) {
  const normalized = normalizeRole(role);
  return normalized === "owner" || normalized === "super_admin";
}

export function isAdminLike(role?: string | null) {
  const normalized = normalizeRole(role);
  return Boolean(normalized && ADMIN_ROLES.includes(normalized));
}
