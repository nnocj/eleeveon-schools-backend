import { IsEmail, IsIn, IsOptional, IsString } from "class-validator";

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
}

export class CancelSubscriptionChangeDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
