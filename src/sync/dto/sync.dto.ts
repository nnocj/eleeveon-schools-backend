import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import { Type } from "class-transformer";

export class SyncPushRecordDto {
  @IsString()
  tableName!: string;

  @Type(() => Number)
  @IsInt()
  localId!: number;

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
  version!: number;

  @Type(() => Number)
  @IsInt()
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
  records!: SyncPushRecordDto[];
}

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
  since?: number;

  @IsOptional()
  @IsArray()
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
