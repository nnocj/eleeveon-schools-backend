
/**
 * src/sync/dto/sync.dto.ts
 * --------------------------------------------------------------------------
 * Synchronization DTOs with Phase 21 priority workspace bootstrap.
 *
 * Final ID alignment:
 * - local-first records use string IDs across Dexie and Prisma;
 * - workspace bootstrap uses teacherId, studentId and parentId;
 * - the backend no longer uses teacherLocalId, studentLocalId or parentLocalId.
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

  /**
   * Local-first records use string IDs throughout Dexie and Prisma.
   */
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
  @ValidateNested({
    each: true,
  })
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
  @IsString({
    each: true,
  })
  tableNames?: string[];
}

/**
 * A high-priority, role-scoped initial workspace request.
 *
 * accountId remains optional only for backward DTO compatibility.
 * The controller and service must always use req.user.accountId as the
 * authoritative account identity.
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

  /**
   * Optional safe subset of the selected role's essential tables.
   *
   * The service must never permit tables outside the selected role's
   * workspace bootstrap allow-list.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({
    each: true,
  })
  tableNames?: string[];
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

  /**
   * Legacy device-name alias retained for compatible clients.
   */
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

