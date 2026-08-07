import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

export class CreateLicenseUpgradeOfferDto {
  @IsUUID()
  accountId!: string;

  @IsUUID()
  licenseId!: string;

  @IsOptional()
  @IsUUID()
  fromPlanId?: string;

  @IsUUID()
  toPlanId!: string;

  @IsIn([
    "version",
    "capacity",
    "device_limit",
    "connected_migration",
  ])
  upgradeType!:
    | "version"
    | "capacity"
    | "device_limit"
    | "connected_migration";

  @IsOptional()
  @IsString()
  fromVersion?: string;

  @IsOptional()
  @IsString()
  toVersion?: string;

  @IsOptional()
  @IsObject()
  oldLimits?: Record<string, number | null>;

  @IsOptional()
  @IsObject()
  newLimits?: Record<string, number | null>;

  @IsOptional()
  @IsString()
  currency?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  baseAmount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  creditAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  taxAmount?: number;

  @IsDateString()
  quoteExpiresAt!: string;

  @IsOptional()
  @IsObject()
  calculation?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
