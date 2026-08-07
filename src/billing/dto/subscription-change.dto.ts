import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";

/**
 * Payment details used by the existing
 * POST /billing/subscription-quotes/:id/pay endpoint.
 */
export class PaySubscriptionChangeDto {
  @IsIn(["momo", "card", "bank", "cash", "manual"])
  paymentMethod!: "momo" | "card" | "bank" | "cash" | "manual";

  @IsOptional()
  @IsIn(["paystack", "manual"])
  provider?: "paystack" | "manual";

  @IsOptional()
  @IsString()
  payerName?: string;

  @IsOptional()
  @IsString()
  payerPhone?: string;

  @IsOptional()
  @IsEmail()
  payerEmail?: string;

  @IsOptional()
  @IsIn(["mtn", "telecel", "airteltigo"])
  momoNetwork?: "mtn" | "telecel" | "airteltigo";

  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * Used by the newer change-order application endpoint.
 */
export class ApplySubscriptionChangeDto {
  @IsUUID()
  changeOrderId!: string;

  @IsOptional()
  @IsUUID()
  paymentId?: string;

  @IsOptional()
  @IsIn(["payment", "manual", "complimentary"])
  applicationSource?: "payment" | "manual" | "complimentary";
}
