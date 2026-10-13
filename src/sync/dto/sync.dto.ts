/**
 * src/sync/dto/sync.dto.ts
 * --------------------------------------------------------------------------
 * Synchronization DTOs — permanent string IDs and optional workspace paging.
 *
 * Legacy workspace requests (without pageSize/cursor) continue to use the
 * original full-bundle endpoint response.
 */

import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export const DEFAULT_SYNC_PULL_LIMIT = 500;
export const MAX_SYNC_PULL_LIMIT = 2_000;

export const WORKSPACE_BOOTSTRAP_ROLES = [
  "developer",
  "platform_team",
  "super_admin",
  "owner",
  "admin",
  "school_admin",
  "branch_admin",
  "teacher",
  "student",
  "parent",
  "accountant",
] as const;

export type WorkspaceBootstrapRole =
  (typeof WORKSPACE_BOOTSTRAP_ROLES)[number];

export class SyncPushRecordDto {
  @IsString()
  tableName!: string;

  /** Local-first UUID remains a string in Dexie and Prisma. */
  @IsString()
  localId!: string;

  @IsOptional()
  @IsString()
  cloudId?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  updatedAt!: number;

  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;

  @IsObject()
  payload!: Record<string, any>;
}

export class PushSyncDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncPushRecordDto)
  records!: SyncPushRecordDto[];
}

export type SyncPullCursor = {
  updatedAt: number;
  id: string;
};

export class PullSyncDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  /** Explicit server-verified selected workspace membership. */
  @IsOptional()
  @IsString()
  membershipId?: string;

  /** Hints only; verified against the membership stored on the server. */
  @IsOptional()
  @IsString()
  @IsIn(WORKSPACE_BOOTSTRAP_ROLES)
  role?: WorkspaceBootstrapRole;

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
  @IsString()
  deviceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  since?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cursorUpdatedAt?: number;

  @IsOptional()
  @IsString()
  cursorId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SYNC_PULL_LIMIT)
  limit?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(250)
  @IsString({ each: true })
  tableNames?: string[];
}

/**
 * Role-scoped bootstrap. JWT account and server-side membership are
 * authoritative. Paging is additive and opt-in; legacy responses remain.
 */
export class WorkspaceBootstrapDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  membershipId?: string;

  @IsString()
  @IsIn(WORKSPACE_BOOTSTRAP_ROLES)
  role!: WorkspaceBootstrapRole;

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

  /** Restricts data to a subset of server-authorized role tables. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  tableNames?: string[];

  /** Opt in to bounded network responses; 1–500 records. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;

  /** Opaque continuation token returned in the preceding page. */
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class RegisterSyncDeviceDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsString()
  deviceId!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  /** Legacy device name alias. */
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class PlatformCacheDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  since?: number;
}

export class ResolveSyncConflictDto {
  @IsString()
  resolution!: string;

  @IsOptional()
  @IsObject()
  resolutionPayload?: Record<string, any>;

  @IsOptional()
  @IsString()
  note?: string;
}

export type SyncQuotaFailure = {
  code:
    | "SUBSCRIPTION_LIMIT_REACHED"
    | "SUBSCRIPTION_EXPIRED"
    | "FEATURE_DISABLED";
  tableName: string;
  localId: string;
  resource?: string;
  current?: number;
  limit?: number | null;
  requestedIncrease?: number;
  entitlementVersion?: number;
  message: string;
};

export type SyncEntitlementMetadata = {
  entitlementVersion: number;
  validUntil?: string | null;
  status?: string;
};
