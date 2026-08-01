import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export const QUOTE_BILLING_CYCLES = ["monthly", "termly", "yearly", "manual"] as const;
export const QUOTE_CHANGE_TYPES = ["new", "renewal", "extension", "upgrade", "downgrade", "complimentary", "manual_change"] as const;
export const QUOTE_EFFECTIVE_MODES = ["immediate", "period_end"] as const;

export class CreateSubscriptionQuoteDto {
  @IsString()
  planId!: string;

  @IsIn(QUOTE_BILLING_CYCLES)
  billingCycle!: "monthly" | "termly" | "yearly" | "manual";

  @IsOptional()
  @IsIn(QUOTE_CHANGE_TYPES)
  changeType?: "new" | "renewal" | "extension" | "upgrade" | "downgrade" | "complimentary" | "manual_change";

  @IsOptional()
  @IsIn(QUOTE_EFFECTIVE_MODES)
  effectiveMode?: "immediate" | "period_end";

  @IsOptional()
  @IsString()
  privateOfferId?: string;

  @IsOptional()
  @IsString()
  pricingOverrideId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRatePercent?: number;
}
