import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

import { ALL_APP_ROLES } from "../../common/roles";

export class CreateAccountDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsIn(["active", "suspended", "closed"])
  status?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  logoMediaId?: string;

  @IsOptional()
  @IsString()
  photoMediaId?: string;

  @IsOptional()
  @IsString()
  bannerMediaId?: string;

  @IsOptional()
  @IsString()
  defaultLocale?: string;

  @IsOptional()
  @IsString()
  timeZone?: string;
}

export class CreateAccountUserDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(6)
  password!: string;

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
}

export class UpdateAccountUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsIn(ALL_APP_ROLES)
  role?: string;

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
}

export class UpdateAccountUserStatusDto {
  @IsBoolean()
  active!: boolean;
}

export class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  preferredLocale?: string;
}

export class ChangeMyEmailDto {
  @IsEmail()
  newEmail!: string;

  @IsString()
  @MinLength(1)
  currentPassword!: string;
}

export class ChangeMyPasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}

export class UpdateAccountSettingsDto {
  @IsOptional()
  @IsString()
  academicYearStartMonth?: string;

  @IsOptional()
  @IsBoolean()
  allowOfflineMode?: boolean;

  @IsOptional()
  @IsBoolean()
  autoSyncOnLogin?: boolean;

  @IsOptional()
  @IsBoolean()
  requireStrongPasswords?: boolean;

  @IsOptional()
  @IsBoolean()
  requirePasswordChangeForTempUsers?: boolean;

  @IsOptional()
  @IsBoolean()
  allowBranchSwitching?: boolean;

  @IsOptional()
  @IsBoolean()
  allowOwnerDataExport?: boolean;

  @IsOptional()
  @IsIn(["manual", "daily", "weekly", "monthly"])
  backupFrequency?: string;
}
