import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from "class-validator";

const BILLING_CYCLES = [
  "monthly",
  "termly",
  "yearly",
  "manual",
] as const;

const CHANGE_TYPES = [
  "new",
  "renewal",
  "extension",
  "upgrade",
  "downgrade",
  "complimentary",
  "manual_change",
] as const;

const EFFECTIVE_MODES = [
  "immediate",
  "period_end",
] as const;

/**
 * Supports both APIs during migration:
 *
 * Legacy BillingService:
 *   planId, privateOfferId, taxRatePercent
 *
 * New SubscriptionController:
 *   toPlanId, privateOfferCode
 */
export class CreateSubscriptionQuoteDto {
  @ValidateIf((dto) => !dto.toPlanId)
  @IsUUID()
  @IsOptional()
  planId?: string;

  @ValidateIf((dto) => !dto.planId)
  @IsUUID()
  @IsOptional()
  toPlanId?: string;

  @IsIn(BILLING_CYCLES)
  billingCycle!: (typeof BILLING_CYCLES)[number];

  @IsIn(CHANGE_TYPES)
  changeType!: (typeof CHANGE_TYPES)[number];

  @IsOptional()
  @IsIn(EFFECTIVE_MODES)
  effectiveMode?: (typeof EFFECTIVE_MODES)[number];

  /**
   * Legacy internal assignment by offer ID.
   */
  @IsOptional()
  @IsUUID()
  privateOfferId?: string;

  /**
   * Public or owner-facing offer lookup by code.
   */
  @IsOptional()
  @IsString()
  privateOfferCode?: string;

  @IsOptional()
  @IsUUID()
  pricingOverrideId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  taxRatePercent?: number;
}
