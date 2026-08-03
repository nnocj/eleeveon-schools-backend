import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";

import { ALL_APP_ROLES } from "../../common/roles";

const MEMBERSHIP_STATUSES = [
  "invited",
  "active",
  "suspended",
  "revoked",
  "expired",
] as const;

export class CreateMembershipDto {
  @IsString()
  userId!: string;

  @IsIn(ALL_APP_ROLES)
  role!: string;

  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsIn(MEMBERSHIP_STATUSES)
  status?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  label?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  invitedAt?: string | null;

  @IsOptional()
  @IsDateString()
  acceptedAt?: string | null;

  @IsOptional()
  @IsDateString()
  suspendedAt?: string | null;

  @IsOptional()
  @IsDateString()
  endedAt?: string | null;
}

export class UpdateMembershipDto {
  @IsOptional()
  @IsIn(ALL_APP_ROLES)
  role?: string;

  @IsOptional()
  @IsString()
  schoolId?: string | null;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  teacherId?: string | null;

  @IsOptional()
  @IsString()
  studentId?: string | null;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsIn(MEMBERSHIP_STATUSES)
  status?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  label?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  invitedAt?: string | null;

  @IsOptional()
  @IsDateString()
  acceptedAt?: string | null;

  @IsOptional()
  @IsDateString()
  suspendedAt?: string | null;

  @IsOptional()
  @IsDateString()
  endedAt?: string | null;
}