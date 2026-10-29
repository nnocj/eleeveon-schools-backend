import { IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export class MoneyDto {
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsString() currencySymbol?: string;
  @IsOptional() @IsString() currencyName?: string;
}

export class CreatePayrollProfileDto extends MoneyDto {
  @IsString() schoolId!: string;
  @IsString() branchId!: string;
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsString() staffUserId?: string;
  @IsString() fullName!: string;
  @IsOptional() @IsString() role?: string;
  @IsIn(["monthly", "weekly", "daily", "hourly", "contract", "commission"]) payType!: string;
  @Type(() => Number) @IsNumber() @Min(0) baseSalary!: number;
  @IsOptional() @Type(() => Number) @IsNumber() allowanceDefault?: number;
  @IsOptional() @Type(() => Number) @IsNumber() deductionDefault?: number;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankAccountName?: string;
  @IsOptional() @IsString() bankAccountNumber?: string;
  @IsOptional() @IsString() momoNetwork?: string;
  @IsOptional() @IsString() momoNumber?: string;
  @IsOptional() @IsString() momoName?: string;
  @IsOptional() @IsString() preferredPaymentMethod?: string;
}

export class CreatePayrollRunDto extends MoneyDto {
  @IsString() schoolId!: string;
  @IsString() branchId!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() periodStart!: string;
  @IsString() periodEnd!: string;
  @IsOptional() @IsString() payDate?: string;
  @IsOptional() @IsString() note?: string;
}

export class CreatePayrollItemDto extends MoneyDto {
  @IsString() schoolId!: string;
  @IsString() branchId!: string;
  @IsString() payrollRunId!: string;
  @IsOptional() @IsString() payrollProfileId?: string;
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsString() staffUserId?: string;
  @IsString() fullName!: string;
  @IsOptional() @IsString() role?: string;
  @Type(() => Number) @IsNumber() @Min(0) baseSalary!: number;
  @IsOptional() @Type(() => Number) @IsNumber() allowances?: number;
  @IsOptional() @Type(() => Number) @IsNumber() deductions?: number;
  @IsOptional() @Type(() => Number) @IsNumber() bonus?: number;
  @IsOptional() @Type(() => Number) @IsNumber() tax?: number;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() note?: string;
}

export class PayrollStatusDto {
  @IsIn(["draft", "review", "approved", "processing", "paid", "cancelled"])
  status!: string;
}

export class PayPayrollItemDto {
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() receiptNumber?: string;
  @IsOptional() @IsString() providerReference?: string;
  @IsOptional() @IsString() note?: string;
}
