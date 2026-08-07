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
  "grace",
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

const LICENSE_MODELS = [
  "subscription",
  "perpetual",
  "trial",
  "complimentary",
] as const;

const DEPLOYMENT_MODES = [
  "connected",
  "offline",
] as const;

const SYNC_POLICIES = [
  "full",
  "platform_only",
  "disabled",
] as const;

const UPDATE_POLICIES = [
  "continuous",
  "security_only",
  "version_locked",
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
  priceOneTime?: number;

  @IsOptional()
  @IsIn(LICENSE_MODELS)
  licenseModel?: (typeof LICENSE_MODELS)[number];

  @IsOptional()
  @IsIn(DEPLOYMENT_MODES)
  deploymentMode?: (typeof DEPLOYMENT_MODES)[number];

  @IsOptional()
  @IsIn(SYNC_POLICIES)
  syncPolicy?: (typeof SYNC_POLICIES)[number];

  @IsOptional()
  @IsIn(UPDATE_POLICIES)
  updatePolicy?: (typeof UPDATE_POLICIES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  licensedMajorVersion?: number;

  @IsOptional()
  @IsString()
  minimumAppVersion?: string;

  @IsOptional()
  @IsString()
  maximumAppVersion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  deviceLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activationLimit?: number;

  @IsOptional()
  @IsBoolean()
  requiresPeriodicValidation?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  validationIntervalDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offlineGraceDays?: number;

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

  @IsOptional() @IsBoolean() offlineSync?: boolean;
  @IsOptional() @IsBoolean() cloudBackup?: boolean;
  @IsOptional() @IsBoolean() reports?: boolean;
  @IsOptional() @IsBoolean() finance?: boolean;
  @IsOptional() @IsBoolean() attendance?: boolean;
  @IsOptional() @IsBoolean() identityCards?: boolean;
  @IsOptional() @IsBoolean() identitySafety?: boolean;
  @IsOptional() @IsBoolean() transport?: boolean;
  @IsOptional() @IsBoolean() communications?: boolean;
  @IsOptional() @IsBoolean() calendarScheduling?: boolean;
  @IsOptional() @IsBoolean() schoolWebsites?: boolean;
  @IsOptional() @IsBoolean() parentPortal?: boolean;
  @IsOptional() @IsBoolean() studentPortal?: boolean;
  @IsOptional() @IsBoolean() teacherPortal?: boolean;
  @IsOptional() @IsBoolean() advancedAnalytics?: boolean;
  @IsOptional() @IsBoolean() apiAccess?: boolean;
  @IsOptional() @IsBoolean() webhooks?: boolean;
  @IsOptional() @IsBoolean() prioritySupport?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

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

  @IsOptional() @IsDateString() trialStartedAt?: string;
  @IsOptional() @IsDateString() trialEndsAt?: string;
  @IsOptional() @IsDateString() currentPeriodStart?: string;
  @IsOptional() @IsDateString() currentPeriodEnd?: string;
  @IsOptional() @IsDateString() nextBillingDate?: string;
}

export class UpdateSubscriptionDto extends PartialType(
  CreateSubscriptionDto,
) {
  @IsOptional() @IsDateString() cancelledAt?: string;
  @IsOptional() @IsString() cancelReason?: string;
}

export class CreateInvoiceDto {
  @IsString()
  accountId!: string;

  @IsOptional() @IsString() subscriptionId?: string;
  @IsOptional() @IsString() perpetualLicenseId?: string;
  @IsOptional() @IsString() invoiceNumber?: string;
  @IsOptional() @IsString() currency?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  subtotal!: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) discount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) tax?: number;

  @IsOptional()
  @IsIn([
    "draft",
    "issued",
    "part_paid",
    "paid",
    "void",
    "overdue",
    "cancelled",
  ])
  status?: string;

  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() note?: string;
}

export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {}

export class CreatePaymentDto {
  @IsString()
  accountId!: string;

  @IsOptional() @IsString() subscriptionId?: string;
  @IsOptional() @IsString() perpetualLicenseId?: string;
  @IsOptional() @IsString() invoiceId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional() @IsString() currency?: string;

  @IsIn(["momo", "card", "bank", "cash", "manual"])
  method!: string;

  @IsOptional()
  @IsIn(["paystack", "manual"])
  provider?: string;

  @IsOptional()
  @IsIn([
    "pending",
    "processing",
    "paid",
    "failed",
    "refunded",
    "cancelled",
  ])
  status?: string;

  @IsOptional() @IsString() providerReference?: string;
  @IsOptional() @IsString() receiptNumber?: string;
  @IsOptional() @IsString() payerName?: string;
  @IsOptional() @IsString() payerPhone?: string;
  @IsOptional() @IsEmail() payerEmail?: string;

  @IsOptional()
  @IsIn(["mtn", "telecel", "airteltigo"])
  momoNetwork?: string;

  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() note?: string;
}

export class UpdatePaymentDto extends PartialType(CreatePaymentDto) {}
