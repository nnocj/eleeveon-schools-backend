import { IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export class MoneyDto {
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsString() currencySymbol?: string;
  @IsOptional() @IsString() currencyName?: string;
  @IsOptional() @Type(() => Number) @IsNumber() exchangeRate?: number;
}

export class CreateStudentFeeInvoiceDto extends MoneyDto {
  @Type(() => Number) @IsNumber() schoolId!: number;
  @Type(() => Number) @IsNumber() branchId!: number;
  @Type(() => Number) @IsNumber() studentId!: number;
  @IsOptional() @Type(() => Number) @IsNumber() classId?: number;
  @IsOptional() @Type(() => Number) @IsNumber() academicStructureId?: number;
  @IsOptional() @Type(() => Number) @IsNumber() academicPeriodId?: number;
  @IsOptional() @IsString() invoiceNumber?: string;
  @IsOptional() items?: Array<{ name: string; amount: number; description?: string; required?: boolean }>;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subtotal?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) tax?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) total?: number;
  @IsOptional() @IsString() issueDate?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() note?: string;
}

export class UpdateStudentFeeInvoiceDto {
  @IsOptional() @IsIn(["draft", "issued", "part_paid", "paid", "overdue", "cancelled", "void"]) status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() amountPaid?: number;
  @IsOptional() @Type(() => Number) @IsNumber() balance?: number;
  @IsOptional() @IsString() paidAt?: string;
  @IsOptional() @IsString() note?: string;
}

export class CreateStudentFeePaymentDto extends MoneyDto {
  @Type(() => Number) @IsNumber() schoolId!: number;
  @Type(() => Number) @IsNumber() branchId!: number;
  @IsOptional() @Type(() => Number) @IsNumber() invoiceId?: number;
  @Type(() => Number) @IsNumber() studentId!: number;
  @IsOptional() @Type(() => Number) @IsNumber() parentId?: number;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @IsIn(["cash", "momo", "bank", "card", "manual"]) method!: string;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() receiptNumber?: string;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() providerReference?: string;
  @IsOptional() @IsString() payerName?: string;
  @IsOptional() @IsString() payerPhone?: string;
  @IsOptional() @IsString() payerEmail?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() note?: string;
}

export class CreateCurrencySettingDto {
  @Type(() => Number) @IsNumber() schoolId!: number;
  @Type(() => Number) @IsNumber() branchId!: number;
  @IsString() currencyCode!: string;
  @IsString() currencySymbol!: string;
  @IsString() currencyName!: string;
  @IsOptional() allowMultipleCurrencies?: boolean;
  @IsOptional() defaultForFees?: boolean;
  @IsOptional() defaultForPayroll?: boolean;
  @IsOptional() defaultForIncomeExpense?: boolean;
}


/**
 * ---------------------------------------------------------
 * ONLINE STUDENT FEE PAYMENT
 * ---------------------------------------------------------
 */

export class InitiateStudentFeePaymentDto extends MoneyDto {
  @Type(() => Number)
  @IsNumber()
  schoolId!: number;

  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @Type(() => Number)
  @IsNumber()
  studentId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  invoiceId?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsIn(["card", "momo"])
  channel!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  payerName?: string;

  @IsOptional()
  @IsString()
  payerPhone?: string;

  @IsOptional()
  @IsString()
  callbackUrl?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class ConfirmStudentFeePaymentDto {
  @IsString()
  reference!: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  invoiceId?: string | number;
}

/**
 * ---------------------------------------------------------
 * SCHOOL / BRANCH WITHDRAWALS
 * ---------------------------------------------------------
 */

export class InitiateWithdrawalDto extends MoneyDto {
  @Type(() => Number)
  @IsNumber()
  schoolId!: number;

  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  destination!: {
    preferredMethod?: string;

    bankName?: string;
    bankCode?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;

    momoNetwork?: string;
    momoNumber?: string;
    momoName?: string;

    paystackRecipientCode?: string;
    paystackSubaccountCode?: string;
  };

  @IsOptional()
  metadata?: Record<string, any>;
}