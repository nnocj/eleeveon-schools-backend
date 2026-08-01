import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { PartialType } from "@nestjs/mapped-types";

const SUBSCRIPTION_STATUSES = [
  "trial",
  "active",
  "pending",
  "past_due",
  "expired",
  "cancelled",
  "suspended",
] as const;

const BILLING_CYCLES = [
  "monthly",
  "termly",
  "yearly",
  "manual",
] as const;

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

  /**
   * Four-month subscription price.
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceTermly!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceYearly!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxSchools?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxBranches?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxStudents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxTeachers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxStorageMb?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxApiCallsPerMonth?: number;

  // Core platform capabilities.
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

  // Operations, identity and safety.
  @IsOptional()
  @IsBoolean()
  attendance?: boolean;

  @IsOptional()
  @IsBoolean()
  identityCards?: boolean;

  @IsOptional()
  @IsBoolean()
  identitySafety?: boolean;

  @IsOptional()
  @IsBoolean()
  transport?: boolean;

  @IsOptional()
  @IsBoolean()
  communications?: boolean;

  @IsOptional()
  @IsBoolean()
  calendarScheduling?: boolean;

  // Public digital presence.
  @IsOptional()
  @IsBoolean()
  schoolWebsites?: boolean;

  // Role portals and advanced capabilities.
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
  webhooks?: boolean;

  @IsOptional()
  @IsBoolean()
  prioritySupport?: boolean;

  /**
   * Enabled feature keys used by the extensible capability system.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  /**
   * Extensible plan metadata, including metadata.featureFlags.
   */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/**
 * PATCH DTO: every CreatePlanDto property becomes optional.
 */
export class UpdatePlanDto extends PartialType(CreatePlanDto) {}

export class CreateSubscriptionDto {
  @IsString()
  accountId!: string;

  @IsString()
  planId!: string;

  @IsOptional()
  @IsIn(SUBSCRIPTION_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(BILLING_CYCLES)
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
  @IsIn(SUBSCRIPTION_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(BILLING_CYCLES)
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

  @IsOptional()
  @IsDateString()
  cancelledAt?: string;

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

export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {}

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

export class UpdatePaymentDto extends PartialType(CreatePaymentDto) {}
