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

  // Kept for backward compatibility with existing account-management callers.
  // The owner Account Profile uses /accounts/me/email for owner email changes so
  // Account.email and the owner's AppUser.email stay synchronized.
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

  // ======================================================
  // ACCOUNT PROFILE / BRANDING
  // These fields already exist on Prisma Account.
  // ======================================================

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

// ======================================================
// CURRENT LOGGED-IN USER SELF-SERVICE
//
// The owner exists in two places by design:
// - Account = top-level owner/customer account record
// - AppUser = the owner's authenticated login identity
//
// Owner phone/email synchronization is handled in AccountsService.
// These DTOs do not replace the existing administrative user DTOs.
// ======================================================

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

// ======================================================
// ACCOUNT SYSTEM SETTINGS
//
// Country, currency, defaultLocale and timeZone remain first-class Account
// columns. Operational preferences below use AccountSystemSetting.
// ======================================================

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
