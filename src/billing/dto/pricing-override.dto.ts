import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";

export class CreatePricingOverrideDto {
  @IsString() accountId!: string;
  @IsString() planId!: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceMonthly?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceTermly?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceYearly?: number;
  @IsOptional() @IsIn(["fixed", "percentage", "free"]) discountType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) discountValue?: number;
  @IsOptional() @IsObject() featureOverrides?: Record<string, boolean>;
  @IsOptional() @IsObject() limitOverrides?: Record<string, number | null>;
  @IsOptional() @IsDateString() validFrom?: string | null;
  @IsOptional() @IsDateString() validUntil?: string | null;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdatePricingOverrideDto {
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceMonthly?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceTermly?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceYearly?: number;
  @IsOptional() @IsIn(["fixed", "percentage", "free"]) discountType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) discountValue?: number;
  @IsOptional() @IsObject() featureOverrides?: Record<string, boolean>;
  @IsOptional() @IsObject() limitOverrides?: Record<string, number | null>;
  @IsOptional() @IsDateString() validFrom?: string | null;
  @IsOptional() @IsDateString() validUntil?: string | null;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
