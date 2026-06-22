import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { FINANCE_ROLES, PARENT_ROLES, STUDENT_ROLES } from "../common/roles";
import { FinanceService } from "./finance.service";
import {
  ConfirmStudentFeePaymentDto,
  CreateCurrencySettingDto,
  CreateStudentFeeInvoiceDto,
  CreateStudentFeePaymentDto,
  InitiateStudentFeePaymentDto,
  InitiateWithdrawalDto,
  UpdateStudentFeeInvoiceDto,
} from "./dto/finance.dto";

/**
 * src/finance/finance.controller.ts
 * ---------------------------------------------------------
 * ELEEVEON FINANCE CONTROLLER — ACCESS FIX
 * ---------------------------------------------------------
 *
 * Why this update is needed:
 * - The old controller used @Roles(...FINANCE_ROLES) at class level.
 * - That blocked students/parents from paying fees because every /finance route
 *   required finance-admin roles.
 *
 * New access model:
 * - Admin finance routes remain protected by FINANCE_ROLES.
 * - Student/parent checkout routes are protected by STUDENT_ROLES/PARENT_ROLES.
 *
 * Safe student/parent routes:
 * - POST /finance/student-fees/payments/initiate
 * - POST /finance/student-fees/payments/confirm
 * - GET  /finance/student-fees/payments/verify/:reference
 *
 * Admin-only routes:
 * - dashboard
 * - wallet
 * - invoices
 * - manual fee payments
 * - withdrawals
 * - currency settings
 */

const STUDENT_PAYMENT_ROLES = [...STUDENT_ROLES, ...PARENT_ROLES];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("finance")
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  @Get("dashboard")
  @Roles(...FINANCE_ROLES)
  dashboard(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.dashboard(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Get("wallet")
  @Roles(...FINANCE_ROLES)
  wallet(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.wallet(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Get("fee-invoices")
  @Roles(...FINANCE_ROLES)
  listInvoices(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.listInvoices(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Post("fee-invoices")
  @Roles(...FINANCE_ROLES)
  createInvoice(@Req() req: any, @Body() dto: CreateStudentFeeInvoiceDto) {
    return this.service.createInvoice(req.user, dto);
  }

  @Patch("fee-invoices/:id")
  @Roles(...FINANCE_ROLES)
  updateInvoice(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateStudentFeeInvoiceDto) {
    return this.service.updateInvoice(req.user, id, dto);
  }

  @Delete("fee-invoices/:id")
  @Roles(...FINANCE_ROLES)
  deleteInvoice(@Req() req: any, @Param("id") id: string) {
    return this.service.deleteInvoice(req.user, id);
  }

  @Get("fee-payments")
  @Roles(...FINANCE_ROLES)
  listPayments(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.listFeePayments(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Post("fee-payments")
  @Roles(...FINANCE_ROLES)
  recordPayment(@Req() req: any, @Body() dto: CreateStudentFeePaymentDto) {
    return this.service.recordFeePayment(req.user, dto);
  }

  @Post("student-fees/payments/initiate")
  @Roles(...STUDENT_PAYMENT_ROLES)
  initiateStudentFeePayment(@Req() req: any, @Body() dto: InitiateStudentFeePaymentDto) {
    return this.service.initiateStudentFeePayment(req.user, dto);
  }

  @Post("student-fees/payments/confirm")
  @Roles(...STUDENT_PAYMENT_ROLES)
  confirmStudentFeePayment(@Req() req: any, @Body() dto: ConfirmStudentFeePaymentDto) {
    return this.service.confirmStudentFeePayment(req.user, dto);
  }

  @Get("student-fees/payments/verify/:reference")
  @Roles(...STUDENT_PAYMENT_ROLES)
  verifyStudentFeePayment(@Req() req: any, @Param("reference") reference: string, @Query("provider") provider?: string, @Query("invoiceId") invoiceId?: string) {
    return this.service.confirmStudentFeePayment(req.user, {
      reference,
      provider: provider || "paystack",
      invoiceId,
    } as ConfirmStudentFeePaymentDto);
  }

  @Post("withdrawals/initiate")
  @Roles(...FINANCE_ROLES)
  initiateWithdrawal(@Req() req: any, @Body() dto: InitiateWithdrawalDto) {
    return this.service.initiateWithdrawal(req.user, dto);
  }

  @Get("currency-settings")
  @Roles(...FINANCE_ROLES)
  listCurrencySettings(@Req() req: any, @Query("schoolId") schoolId?: string, @Query("branchId") branchId?: string) {
    return this.service.listCurrencySettings(req.user, schoolId ? Number(schoolId) : undefined, branchId ? Number(branchId) : undefined);
  }

  @Post("currency-settings")
  @Roles(...FINANCE_ROLES)
  setCurrencySetting(@Req() req: any, @Body() dto: CreateCurrencySettingDto) {
    return this.service.setCurrencySetting(req.user, dto);
  }
}
