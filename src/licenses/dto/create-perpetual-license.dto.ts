import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

export class CreatePerpetualLicenseDto {
  @IsUUID()
  accountId!: string;

  @IsUUID()
  planId!: string;

  @IsString()
  purchasedVersion!: string;

  @IsOptional()
  @IsString()
  entitledVersion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  licensedMajorVersion?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxSchools?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxBranches?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxStudents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxTeachers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  deviceLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activationLimit?: number;

  @IsOptional()
  @IsString()
  syncPolicy?: "platform_only" | "disabled";

  @IsOptional()
  @IsString()
  updatePolicy?: "version_locked" | "security_only";

  @IsOptional()
  @IsBoolean()
  requiresPeriodicValidation?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  validationIntervalDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offlineGraceDays?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  listAmount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountAmount?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountPaid!: number;

  @IsOptional()
  @IsUUID()
  privateOfferId?: string;

  @IsOptional()
  @IsUUID()
  pricingOverrideId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
