import type { AppRole } from "./roles";

export type AuthMembership = {
  id: string;
  role: AppRole;
  schoolId?: number | null;
  branchId?: number | null;
  teacherLocalId?: number | null;
  studentLocalId?: number | null;
  parentLocalId?: number | null;
  active?: boolean;
};

export type AuthUser = {
  id: string;
  accountId: string;
  email: string;
  role: AppRole;
  memberships?: AuthMembership[];
};

export type AuthRequest = Request & {
  user: AuthUser;
};
