import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";

export class CreatePrivateOfferDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() basePlanId!: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceMonthly?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceTermly?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceYearly?: number;
  @IsOptional() @IsIn(["fixed", "percentage", "free"]) discountType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) discountValue?: number;
  @IsOptional() @IsObject() featureOverrides?: Record<string, boolean>;
  @IsOptional() @IsObject() limitOverrides?: Record<string, number | null>;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxRedemptions?: number;
  @IsOptional() @IsBoolean() visibleToOwner?: boolean;
  @IsOptional() @IsString() ownerLabel?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdatePrivateOfferDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() basePlanId?: string;
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
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxRedemptions?: number;
  @IsOptional() @IsBoolean() visibleToOwner?: boolean;
  @IsOptional() @IsString() ownerLabel?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class AssignPrivateOfferDto {
  @IsString() accountId!: string;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() reason?: string;
}
