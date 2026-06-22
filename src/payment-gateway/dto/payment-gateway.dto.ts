import {
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class MoneyDto {
  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  currencySymbol?: string;

  @IsOptional()
  @IsString()
  currencyName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  exchangeRate?: number;
}

export class CreatePaymentIntentDto extends MoneyDto {
  @Type(() => Number)
  @IsNumber()
  schoolId!: number;

  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @IsIn(["student_fee", "subscription", "income", "payroll", "other"])
  purpose!: "student_fee" | "subscription" | "income" | "payroll" | "other";

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsIn(["cash", "momo", "bank", "card", "manual"])
  channel!: "cash" | "momo" | "bank" | "card" | "manual";

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  studentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  parentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  teacherId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  feeInvoiceId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  incomeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  payrollRunId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  payrollItemId?: number;

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
  @IsString()
  momoNetwork?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  metadata?: any;
}

export class UpdatePaymentIntentDto {
  @IsOptional()
  @IsIn(["draft", "pending", "processing", "paid", "part_paid", "failed", "cancelled", "refunded", "reversed"])
  status?: string;

  @IsOptional()
  @IsString()
  providerReference?: string;

  @IsOptional()
  @IsString()
  authorizationUrl?: string;

  @IsOptional()
  @IsString()
  accessCode?: string;

  @IsOptional()
  @IsString()
  paidAt?: string;

  @IsOptional()
  metadata?: any;
}

export class CreatePaymentTransactionDto extends MoneyDto {
  @Type(() => Number)
  @IsNumber()
  schoolId!: number;

  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @IsIn(["student_fee", "subscription", "income", "expense", "payroll", "refund", "other"])
  purpose!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsIn(["cash", "momo", "bank", "card", "manual"])
  channel!: string;

  @IsIn(["inflow", "outflow"])
  direction!: "inflow" | "outflow";

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  paymentIntentId?: number;

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
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @IsOptional()
  @IsString()
  providerReference?: string;

  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  metadata?: any;
}

export class VerifyProviderReferenceDto {
  @IsString()
  provider!: string;

  @IsString()
  reference!: string;
}
