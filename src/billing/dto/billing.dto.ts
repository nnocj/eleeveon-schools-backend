import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class CreatePlanDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMonthly!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceYearly!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxSchools?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxBranches?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxUsers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxStudents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxTeachers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxStorageMb?: number;

  @IsOptional()
  @IsBoolean()
  offlineSync?: boolean;

  @IsOptional()
  @IsBoolean()
  cloudBackup?: boolean;

  @IsOptional()
  @IsBoolean()
  reports?: boolean;

  @IsOptional()
  @IsBoolean()
  finance?: boolean;

  @IsOptional()
  @IsBoolean()
  parentPortal?: boolean;

  @IsOptional()
  @IsBoolean()
  studentPortal?: boolean;

  @IsOptional()
  @IsBoolean()
  teacherPortal?: boolean;

  @IsOptional()
  @IsBoolean()
  advancedAnalytics?: boolean;

  @IsOptional()
  @IsBoolean()
  apiAccess?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdatePlanDto extends CreatePlanDto {}

export class CreateSubscriptionDto {
  @IsString()
  accountId!: string;

  @IsString()
  planId!: string;

  @IsOptional()
  @IsIn(["trial", "active", "pending", "past_due", "expired", "cancelled", "suspended"])
  status?: string;

  @IsOptional()
  @IsIn(["monthly", "yearly", "manual"])
  billingCycle?: string;

  @IsOptional()
  @IsDateString()
  trialStartedAt?: string;

  @IsOptional()
  @IsDateString()
  trialEndsAt?: string;

  @IsOptional()
  @IsDateString()
  currentPeriodStart?: string;

  @IsOptional()
  @IsDateString()
  currentPeriodEnd?: string;

  @IsOptional()
  @IsDateString()
  nextBillingDate?: string;
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsIn(["trial", "active", "pending", "past_due", "expired", "cancelled", "suspended"])
  status?: string;

  @IsOptional()
  @IsIn(["monthly", "yearly", "manual"])
  billingCycle?: string;

  @IsOptional()
  @IsDateString()
  trialEndsAt?: string;

  @IsOptional()
  @IsDateString()
  currentPeriodStart?: string;

  @IsOptional()
  @IsDateString()
  currentPeriodEnd?: string;

  @IsOptional()
  @IsDateString()
  nextBillingDate?: string;

  @IsOptional()
  @IsString()
  cancelReason?: string;
}

export class CreateInvoiceDto {
  @IsString()
  accountId!: string;

  @IsOptional()
  @IsString()
  subscriptionId?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  subtotal!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tax?: number;

  @IsOptional()
  @IsIn(["draft", "issued", "paid", "void", "overdue"])
  status?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  subtotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tax?: number;

  @IsOptional()
  @IsIn(["draft", "issued", "paid", "void", "overdue"])
  status?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreatePaymentDto {
  @IsString()
  accountId!: string;

  @IsOptional()
  @IsString()
  subscriptionId?: string;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsIn(["momo", "card", "bank", "cash", "manual"])
  method!: string;

  @IsOptional()
  @IsIn(["paystack", "manual"])
  provider?: string;

  @IsOptional()
  @IsIn(["pending", "paid", "failed", "refunded", "cancelled"])
  status?: string;

  @IsOptional()
  @IsString()
  providerReference?: string;

  @IsOptional()
  @IsString()
  receiptNumber?: string;

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
  momoNetwork?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePaymentDto {
  @IsOptional()
  @IsIn(["pending", "paid", "failed", "refunded", "cancelled"])
  status?: string;

  @IsOptional()
  @IsString()
  providerReference?: string;

  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}