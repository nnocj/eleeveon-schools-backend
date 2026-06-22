import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../common/auth-user";
import { RecordStoreService } from "../payment-gateway/record-store.service";
import { PaymentGatewayService } from "../payment-gateway/payment-gateway.service";
import {
  CreateCurrencySettingDto,
  CreateStudentFeeInvoiceDto,
  CreateStudentFeePaymentDto,
  UpdateStudentFeeInvoiceDto,
} from "./dto/finance.dto";

/**
 * src/finance/finance.service.ts
 * ---------------------------------------------------------
 * ELEEVEON FINANCE SERVICE
 * ---------------------------------------------------------
 *
 * Upgraded for real student fee payments.
 *
 * What this service now supports:
 * - Branch/school finance dashboard.
 * - Student fee invoice CRUD.
 * - Student fee invoice items.
 * - Manual fee payment recording.
 * - Online student-fee payment initiation through PaymentGatewayService.
 * - Online payment verification/confirmation.
 * - findInvoice uses records.list() because RecordStoreService has no findOne().
 * - Invoice balance recalculation after every successful payment.
 * - Payment transaction tracking for school/branch money records.
 * - Branch wallet summary and withdrawal/cash-out initiation.
 *
 * Important architecture:
 * - BillingModule remains for Eleeveon subscription money.
 * - FinanceModule + PaymentGatewayModule handle school/student fee money.
 * - studentFeeInvoices remain the source of truth for student balances.
 * - studentFeePayments are the receipt/payment history.
 * - paymentTransactions track inflow for branch/school financial reporting.
 *
 * Money flow:
 * Student/Parent pays fee
 *   -> payment intent/transaction is created
 *   -> provider confirms payment
 *   -> studentFeePayments is created/updated
 *   -> studentFeeInvoice amountPaid/balance/status is recalculated
 *   -> paymentTransactions records inflow for school/branch tracking
 */

type AnyRecord = Record<string, any>;

type InitiateStudentFeePaymentDto = {
  schoolId: number;
  branchId: number;
  invoiceId?: string | number;
  amount?: number;
  method?: string;
  provider?: string;
  payerName?: string;
  payerPhone?: string;
  payerEmail?: string;
  callbackUrl?: string;
  note?: string;
  metadata?: AnyRecord;
};

type ConfirmStudentFeePaymentDto = {
  invoiceId?: string | number;
  reference?: string;
  providerReference?: string;
  paymentId?: string | number;
  status?: string;
  provider?: string;
  amount?: number;
  method?: string;
  payerName?: string;
  payerPhone?: string;
  payerEmail?: string;
  note?: string;
  metadata?: AnyRecord;
};

type InitiateWithdrawalDto = {
  schoolId: number;
  branchId: number;
  amount: number;
  currencyCode?: string;
  reason?: string;
  referenceNumber?: string;
  destination: {
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
  metadata?: AnyRecord;
};

function toNumber(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function isPaidStatus(value?: string | null) {
  return ["paid", "success", "succeeded", "successful"].includes(normalizeStatus(value));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function idOf(record: any) {
  return record?.id ?? record?.cloudRecordId ?? record?.cloudId ?? record?.localId;
}

function makeReceiptNumber() {
  return `RCPT-${Date.now().toString(36).toUpperCase().slice(-8)}`;
}

function invoiceStatus(total: number, paid: number, dueDate?: string | null) {
  if (paid >= total && total > 0) return "paid";
  if (paid > 0) return "part_paid";
  if (dueDate && new Date(dueDate).getTime() < Date.now()) return "overdue";
  return "issued";
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly records: RecordStoreService,
    private readonly payments: PaymentGatewayService
  ) {}

  async dashboard(user: AuthUser, schoolId?: number, branchId?: number) {
    const [invoices, feePayments, transactions, currencySettings] = await Promise.all([
      this.records.list(user, "studentFeeInvoices", { schoolId, branchId }),
      this.records.list(user, "studentFeePayments", { schoolId, branchId }),
      this.records.list(user, "paymentTransactions", { schoolId, branchId }),
      this.records.list(user, "schoolCurrencySettings", { schoolId, branchId }),
    ]);

    const activeInvoices = invoices.filter((row: any) => row?.isDeleted !== true);
    const paidFeePayments = feePayments.filter((row: any) => row?.isDeleted !== true && isPaidStatus(row.status || "paid"));
    const inflowTransactions = transactions.filter(
      (row: any) => row?.isDeleted !== true && row.direction === "inflow" && isPaidStatus(row.status || "paid")
    );

    const totalInvoiced = activeInvoices.reduce((sum: number, row: any) => sum + toNumber(row.total), 0);
    const totalPaid = paidFeePayments.reduce((sum: number, row: any) => sum + toNumber(row.amount), 0);
    const transactionInflow = inflowTransactions.reduce((sum: number, row: any) => sum + toNumber(row.amount), 0);
    const outstanding = activeInvoices.reduce((sum: number, row: any) => sum + toNumber(row.balance), 0);

    return {
      totalInvoiced,
      totalPaid,
      transactionInflow,
      outstanding,
      invoiceCount: activeInvoices.length,
      paymentCount: paidFeePayments.length,
      transactionCount: transactions.length,
      overdueCount: activeInvoices.filter((row: any) => normalizeStatus(row.status) === "overdue").length,
      paidInvoiceCount: activeInvoices.filter((row: any) => normalizeStatus(row.status) === "paid").length,
      currencySettings,
    };
  }

  listInvoices(user: AuthUser, schoolId?: number, branchId?: number) {
    return this.records.list(user, "studentFeeInvoices", { schoolId, branchId });
  }

  private async findInvoice(user: AuthUser, invoiceId: string | number) {
    /**
     * RecordStoreService currently exposes list/create/update/softDelete.
     * It does not expose findOne, so we resolve the invoice by listing the
     * account-scoped records and matching id/cloudRecordId/cloudId/localId.
     */
    const invoices = await this.records.list(user, "studentFeeInvoices", {});
    const found = invoices.find((row: any) => String(idOf(row)) === String(invoiceId));

    if (!found) {
      throw new NotFoundException("Student fee invoice was not found.");
    }

    return found;
  }

  private async listInvoicePayments(user: AuthUser, invoiceId: string | number) {
    const payments = await this.records.list(user, "studentFeePayments", {});
    return payments.filter(
      (row: any) =>
        row?.isDeleted !== true &&
        String(row.invoiceId || "") === String(invoiceId) &&
        isPaidStatus(row.status || "paid")
    );
  }

  private async recalculateInvoiceBalance(user: AuthUser, invoice: AnyRecord) {
    const invoiceId = idOf(invoice);
    const payments = await this.listInvoicePayments(user, invoiceId);
    const total = toNumber(invoice.total);
    const amountPaid = payments.reduce((sum: number, payment: any) => sum + toNumber(payment.amount), 0);
    const balance = Math.max(0, total - amountPaid);
    const status = invoiceStatus(total, amountPaid, invoice.dueDate);

    await this.records.update(user, "studentFeeInvoices", String(invoiceId), {
      amountPaid,
      balance,
      status,
      paidAt: status === "paid" ? nowIso() : invoice.paidAt,
    });

    return {
      ...invoice,
      amountPaid,
      balance,
      status,
      paidAt: status === "paid" ? nowIso() : invoice.paidAt,
    };
  }

  async createInvoice(user: AuthUser, dto: CreateStudentFeeInvoiceDto) {
    const subtotal = dto.subtotal ?? (dto.items || []).reduce((sum, item) => sum + toNumber(item.amount), 0);
    const discount = toNumber(dto.discount);
    const tax = toNumber(dto.tax);
    const total = dto.total ?? Math.max(0, subtotal - discount + tax);
    const issueDate = dto.issueDate || today();

    const invoice = await this.records.create(user, "studentFeeInvoices", {
      ...dto,
      invoiceNumber: dto.invoiceNumber || `INV-${Date.now()}`,
      subtotal,
      discount,
      tax,
      total,
      amountPaid: 0,
      balance: total,
      status: "issued",
      issueDate,
      currencyCode: dto.currencyCode || "GHS",
      currencySymbol: dto.currencySymbol || "GH₵",
      currencyName: dto.currencyName || "Ghanaian Cedi",
      active: true,
      isDeleted: false,
    });

    const invoiceId = idOf(invoice);

    for (const [index, item] of (dto.items || []).entries()) {
      await this.records.create(user, "studentFeeInvoiceItems", {
        schoolId: dto.schoolId,
        branchId: dto.branchId,
        invoiceId,
        feeStructureId: (dto as any).feeStructureId,
        name: item.name,
        description: item.description,
        amount: toNumber(item.amount),
        unitAmount: toNumber(item.amount),
        quantity: 1,
        required: item.required ?? true,
        order: index + 1,
        currencyCode: dto.currencyCode || "GHS",
        currencySymbol: dto.currencySymbol || "GH₵",
        currencyName: dto.currencyName || "Ghanaian Cedi",
        active: true,
        isDeleted: false,
      });
    }

    return invoice;
  }

  updateInvoice(user: AuthUser, id: string, dto: UpdateStudentFeeInvoiceDto) {
    return this.records.update(user, "studentFeeInvoices", id, dto);
  }

  deleteInvoice(user: AuthUser, id: string) {
    return this.records.softDelete(user, "studentFeeInvoices", id);
  }

  listFeePayments(user: AuthUser, schoolId?: number, branchId?: number) {
    return this.records.list(user, "studentFeePayments", { schoolId, branchId });
  }

  async recordFeePayment(user: AuthUser, dto: CreateStudentFeePaymentDto) {
    const invoice = await this.findInvoice(user, dto.invoiceId as any);
    const invoiceId = idOf(invoice);
    const amount = toNumber(dto.amount);

    if (amount <= 0) {
      throw new BadRequestException("Payment amount must be greater than zero.");
    }

    const currentBalance = toNumber(invoice.balance || invoice.total);
    if (amount > currentBalance) {
      throw new BadRequestException("Payment amount cannot be greater than the invoice balance.");
    }

    const payment = await this.records.create(user, "studentFeePayments", {
      ...dto,
      invoiceId,
      studentId: dto.studentId || invoice.studentId,
      date: dto.date || today(),
      status: "paid",
      paidAt: nowIso(),
      receiptNumber: dto.receiptNumber || makeReceiptNumber(),
      currencyCode: dto.currencyCode || invoice.currencyCode || "GHS",
      currencySymbol: dto.currencySymbol || invoice.currencySymbol || "GH₵",
      currencyName: dto.currencyName || invoice.currencyName || "Ghanaian Cedi",
      active: true,
      isDeleted: false,
    });

    await this.payments.createTransaction(user, {
      schoolId: dto.schoolId || invoice.schoolId,
      branchId: dto.branchId || invoice.branchId,
      invoiceId,
      paymentId: idOf(payment),
      studentId: dto.studentId || invoice.studentId,
      purpose: "student_fee",
      direction: "inflow",
      amount,
      channel: dto.method,
      provider: dto.provider || "manual",
      status: "paid",
      receiptNumber: payment.receiptNumber,
      referenceNumber: dto.referenceNumber,
      providerReference: dto.providerReference,
      payerName: dto.payerName,
      payerPhone: dto.payerPhone,
      payerEmail: dto.payerEmail,
      currencyCode: dto.currencyCode || invoice.currencyCode || "GHS",
      currencySymbol: dto.currencySymbol || invoice.currencySymbol || "GH₵",
      currencyName: dto.currencyName || invoice.currencyName || "Ghanaian Cedi",
      note: dto.note,
    } as any);

    await this.recalculateInvoiceBalance(user, invoice);

    return payment;
  }

  /**
   * Starts an online student-fee payment.
   *
   * This should be called by StudentPayments.tsx / ParentPayments.tsx when the user clicks Pay Now.
   * The backend should create/return a provider authorization URL through PaymentGatewayService.
   *
   * NOTE:
   * PaymentGatewayService implementations vary in your codebase, so this method calls
   * initiatePayment if available, otherwise createIntent if available, otherwise falls back
   * to createTransaction as a pending transaction.
   */
  async initiateStudentFeePayment(user: AuthUser, dto: InitiateStudentFeePaymentDto) {
    if (!dto.invoiceId) {
      throw new BadRequestException("Invoice id is required to initiate student fee payment.");
    }

    const invoice = await this.findInvoice(user, dto.invoiceId);
    const invoiceId = idOf(invoice);
    const balance = toNumber(invoice.balance || invoice.total);
    const amount = dto.amount ? toNumber(dto.amount) : balance;

    if (amount <= 0) {
      throw new BadRequestException("Invoice has no outstanding balance.");
    }

    if (amount > balance) {
      throw new BadRequestException("Payment amount cannot be greater than the invoice balance.");
    }

    const reference = `SF-${Date.now().toString(36).toUpperCase()}-${invoiceId}`;
    const payload = {
      schoolId: dto.schoolId || invoice.schoolId,
      branchId: dto.branchId || invoice.branchId,
      invoiceId,
      studentId: invoice.studentId,
      purpose: "student_fee",
      direction: "inflow",
      amount,
      channel: dto.method || "card",
      method: dto.method || "card",
      provider: dto.provider || "paystack",
      status: "pending",
      referenceNumber: reference,
      providerReference: reference,
      payerName: dto.payerName,
      payerPhone: dto.payerPhone,
      payerEmail: dto.payerEmail,
      currencyCode: invoice.currencyCode || "GHS",
      currencySymbol: invoice.currencySymbol || "GH₵",
      currencyName: invoice.currencyName || "Ghanaian Cedi",
      callbackUrl: dto.callbackUrl,
      note: dto.note || `Student fee payment for ${invoice.invoiceNumber || invoiceId}`,
      metadata: {
        ...(dto.metadata || {}),
        invoiceId,
        studentId: invoice.studentId,
        schoolId: dto.schoolId || invoice.schoolId,
        branchId: dto.branchId || invoice.branchId,
        purpose: "student_fee",
      },
    } as any;

    const gateway: any = this.payments as any;

    if (typeof gateway.initiatePayment === "function") {
      return gateway.initiatePayment(user, payload);
    }

    if (typeof gateway.createIntent === "function") {
      return gateway.createIntent(user, payload);
    }

    const transaction = await this.payments.createTransaction(user, payload);

    return {
      transaction,
      reference,
      status: "pending",
      message:
        "Pending transaction created. Add PaymentGatewayService.initiatePayment/createIntent to return provider authorization URL.",
    };
  }

  /**
   * Confirms an online student-fee payment after provider verification/webhook.
   *
   * This method:
   * - verifies provider reference if PaymentGatewayService exposes verifyPayment,
   * - creates a studentFeePayments receipt,
   * - creates/updates transaction tracking,
   * - recalculates the invoice balance.
   */
  async confirmStudentFeePayment(user: AuthUser, dto: ConfirmStudentFeePaymentDto) {
    const gateway: any = this.payments as any;
    let verified: any = null;

    const reference = dto.reference || dto.providerReference;

    if (reference && typeof gateway.verifyPayment === "function") {
      verified = await gateway.verifyPayment(user, {
        reference,
        provider: dto.provider || "paystack",
        purpose: "student_fee",
      });
    }

    const providerStatus = verified?.status || verified?.data?.status || dto.status || "paid";

    if (!isPaidStatus(providerStatus)) {
      throw new BadRequestException("Payment has not been confirmed as paid.");
    }

    const invoiceId = dto.invoiceId || verified?.invoiceId || verified?.metadata?.invoiceId || verified?.data?.metadata?.invoiceId;

    if (!invoiceId) {
      throw new BadRequestException("Invoice id is required to confirm student fee payment.");
    }

    const invoice = await this.findInvoice(user, invoiceId);
    const amount = toNumber(dto.amount || verified?.amount || verified?.data?.amount || invoice.balance);

    const payment = await this.recordFeePayment(user, {
      schoolId: invoice.schoolId,
      branchId: invoice.branchId,
      invoiceId: idOf(invoice),
      studentId: invoice.studentId,
      amount,
      method: (dto.method as any) || verified?.channel || "card",
      provider: dto.provider || verified?.provider || "paystack",
      referenceNumber: dto.reference || reference,
      providerReference: dto.providerReference || reference,
      payerName: dto.payerName || verified?.customer?.name,
      payerPhone: dto.payerPhone || verified?.customer?.phone,
      payerEmail: dto.payerEmail || verified?.customer?.email,
      note: dto.note || "Online student fee payment confirmed.",
      currencyCode: invoice.currencyCode || "GHS",
      currencySymbol: invoice.currencySymbol || "GH₵",
      currencyName: invoice.currencyName || "Ghanaian Cedi",
    } as any);

    return {
      payment,
      invoice: await this.findInvoice(user, idOf(invoice)),
      verified,
    };
  }

  async wallet(user: AuthUser, schoolId?: number, branchId?: number) {
    const [transactions, withdrawals, payoutSettings, feePayments] = await Promise.all([
      this.records.list(user, "paymentTransactions", { schoolId, branchId }),
      this.records.list(user, "withdrawalRequests", { schoolId, branchId }),
      this.records.list(user, "schoolPayoutSettings", { schoolId, branchId }),
      this.records.list(user, "studentFeePayments", { schoolId, branchId }),
    ]);

    const paidStatuses = new Set(["paid", "success", "succeeded", "settled", "approved"]);
    const pendingStatuses = new Set(["pending", "requested", "processing", "review"]);

    const transactionInflow = transactions
      .filter((row: any) => row?.isDeleted !== true && row.direction === "inflow" && paidStatuses.has(String(row.status || "").toLowerCase()))
      .reduce((sum: number, row: any) => sum + toNumber(row.amount), 0);

    const fallbackFeeInflow = feePayments
      .filter((row: any) => row?.isDeleted !== true && paidStatuses.has(String(row.status || "paid").toLowerCase()))
      .reduce((sum: number, row: any) => sum + toNumber(row.amount), 0);

    const inflow = transactionInflow || fallbackFeeInflow;

    const withdrawn = withdrawals
      .filter((row: any) => row?.isDeleted !== true && paidStatuses.has(String(row.status || "").toLowerCase()))
      .reduce((sum: number, row: any) => sum + toNumber(row.amount), 0);

    const pendingWithdrawals = withdrawals
      .filter((row: any) => row?.isDeleted !== true && pendingStatuses.has(String(row.status || "").toLowerCase()))
      .reduce((sum: number, row: any) => sum + toNumber(row.amount), 0);

    return {
      schoolId,
      branchId,
      inflow,
      withdrawn,
      pendingWithdrawals,
      available: Math.max(0, inflow - withdrawn - pendingWithdrawals),
      transactionCount: transactions.length,
      withdrawalCount: withdrawals.length,
      payoutSetting: payoutSettings.find((row: any) => row?.isDeleted !== true && row.active !== false) || payoutSettings[0] || null,
    };
  }

  async initiateWithdrawal(user: AuthUser, dto: InitiateWithdrawalDto) {
    const amount = toNumber(dto.amount);

    if (amount <= 0) {
      throw new BadRequestException("Withdrawal amount must be greater than zero.");
    }

    if (!dto.schoolId || !dto.branchId) {
      throw new BadRequestException("School and branch are required for withdrawal.");
    }

    if (!dto.destination) {
      throw new BadRequestException("Payout destination is required.");
    }

    const wallet = await this.wallet(user, dto.schoolId, dto.branchId);

    if (amount > toNumber(wallet.available)) {
      throw new BadRequestException("Withdrawal amount cannot be greater than available balance.");
    }

    const referenceNumber = dto.referenceNumber || `WD-${Date.now().toString(36).toUpperCase()}`;

    let transferResult: any = null;

    try {
      transferResult = await (this.payments as any).initiateTransfer(user, {
        schoolId: dto.schoolId,
        branchId: dto.branchId,
        amount,
        currencyCode: dto.currencyCode || "GHS",
        reason: dto.reason || "School fee withdrawal",
        referenceNumber,
        destination: dto.destination,
        metadata: dto.metadata,
      });
    } catch (error: any) {
      transferResult = {
        ok: false,
        status: "requested",
        referenceNumber,
        providerError: error?.message || String(error),
      };
    }

    const status = transferResult?.ok ? transferResult.status || "processing" : "requested";

    const withdrawal = await this.records.create(user, "withdrawalRequests", {
      schoolId: dto.schoolId,
      branchId: dto.branchId,
      amount,
      method: dto.destination.preferredMethod || "bank",
      accountName: dto.destination.preferredMethod === "momo" ? dto.destination.momoName : dto.destination.bankAccountName,
      accountNumber: dto.destination.preferredMethod === "momo" ? dto.destination.momoNumber : dto.destination.bankAccountNumber,
      bankName: dto.destination.bankName,
      bankCode: dto.destination.bankCode,
      momoNetwork: dto.destination.momoNetwork,
      status,
      referenceNumber: transferResult?.referenceNumber || referenceNumber,
      providerReference: transferResult?.providerReference,
      provider: transferResult?.ok ? "paystack" : undefined,
      requestedAt: nowIso(),
      paidAt: status === "paid" ? nowIso() : undefined,
      currencyCode: dto.currencyCode || "GHS",
      currencySymbol: "GH₵",
      currencyName: "Ghanaian Cedi",
      note: dto.reason,
      metadata: {
        ...(dto.metadata || {}),
        transferResult,
      },
      active: true,
      isDeleted: false,
    } as any);

    return {
      ok: Boolean(transferResult?.ok),
      status,
      withdrawal,
      transfer: transferResult,
      wallet: await this.wallet(user, dto.schoolId, dto.branchId),
    };
  }

  listCurrencySettings(user: AuthUser, schoolId?: number, branchId?: number) {
    return this.records.list(user, "schoolCurrencySettings", { schoolId, branchId });
  }

  setCurrencySetting(user: AuthUser, dto: CreateCurrencySettingDto) {
    return this.records.create(user, "schoolCurrencySettings", {
      ...dto,
      active: true,
      isDeleted: false,
    });
  }
}
