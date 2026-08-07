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

export class CreatePrivateOfferDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  basePlanId!: string;

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
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @IsOptional()
  @IsBoolean()
  visibleToOwner?: boolean;

  @IsOptional()
  @IsString()
  ownerLabel?: string;
}

export class AssignPrivateOfferDto {
  @IsUUID()
  accountId!: string;

  @IsUUID()
  offerId!: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
