import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

export class UpsertPricingOverrideDto {
  @IsUUID()
  accountId!: string;

  @IsUUID()
  planId!: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceMonthly?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceTermly?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceYearly?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceOneTime?: number;

  @IsOptional()
  @IsString()
  discountType?: "fixed" | "percentage" | "free";

  @IsOptional()
  @IsInt()
  @Min(0)
  discountValue?: number;

  @IsOptional()
  @IsObject()
  featureOverrides?: Record<string, boolean>;

  @IsOptional()
  @IsObject()
  limitOverrides?: Record<string, number | null>;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
