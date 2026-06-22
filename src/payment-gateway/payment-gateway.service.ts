import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthUser } from "../common/auth-user";
import { RecordStoreService } from "./record-store.service";
import {
  CreatePaymentIntentDto,
  CreatePaymentTransactionDto,
  UpdatePaymentIntentDto,
  VerifyProviderReferenceDto,
} from "./dto/payment-gateway.dto";

/**
 * src/payment-gateway/payment-gateway.service.ts
 * ---------------------------------------------------------
 * ELEEVEON PAYMENT GATEWAY SERVICE
 * ---------------------------------------------------------
 *
 * Upgraded payment engine.
 *
 * What this service now supports:
 * - Existing local-first payment intents.
 * - Existing operational payment transactions.
 * - Paystack transaction initialization for student/school fee checkout.
 * - Paystack transaction verification.
 * - Paystack transfer recipient creation for bank/momo payout destinations.
 * - Paystack transfer initiation for branch/school withdrawals.
 *
 * Important money-flow rule:
 * - PaymentCheckout / Paystack initialize is for collecting money from students/parents.
 * - Paystack Transfer is for paying money out to a school/branch payout destination.
 *
 * Required env:
 * - PAYSTACK_MODE=test | live
 * - PAYSTACK_TEST_SECRET_KEY=sk_test_xxx
 * - PAYSTACK_LIVE_SECRET_KEY=sk_live_xxx
 * - PAYSTACK_TEST_CALLBACK_URL=http://localhost:3000/student/payments
 * - PAYSTACK_LIVE_CALLBACK_URL=https://schools.eleeveon.com/student/payments
 *
 * Backward compatible fallback:
 * - PAYSTACK_SECRET_KEY
 * - PAYSTACK_CALLBACK_URL
 *
 * Notes:
 * - This service stores intents/transactions through RecordStoreService so your
 *   existing SyncRecord/local-first architecture remains intact.
 * - Real withdrawal execution depends on your Paystack account having transfers
 *   enabled and the destination bank/mobile-money details being valid.
 */

type AnyRecord = Record<string, any>;

type InitializePaymentDto = CreatePaymentIntentDto & {
  invoiceId?: string | number;
  studentId?: string | number;
  email?: string;
  payerEmail?: string;
  payerName?: string;
  payerPhone?: string;
  callbackUrl?: string;
  metadata?: AnyRecord;
};

type VerifyPaymentDto = VerifyProviderReferenceDto & {
  purpose?: string;
};

type TransferDestination = {
  preferredMethod?: "bank" | "momo" | string;
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

type InitiateTransferDto = {
  schoolId?: number;
  branchId?: number;
  amount: number;
  currencyCode?: string;
  reason?: string;
  referenceNumber?: string;
  destination: TransferDestination;
  metadata?: AnyRecord;
};

function toNumber(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pesewas(amount: number) {
  return Math.round(toNumber(amount) * 100);
}

function nowIso() {
  return new Date().toISOString();
}

function makeReference(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function clean(value: any) {
  return String(value || "").trim();
}

@Injectable()
export class PaymentGatewayService {
  constructor(
    private readonly records: RecordStoreService,
    private readonly config: ConfigService
  ) {}

  listIntents(user: AuthUser, schoolId?: number, branchId?: number) {
    return this.records.list(user, "paymentIntents", { schoolId, branchId });
  }

  createIntent(user: AuthUser, dto: CreatePaymentIntentDto) {
    const provider = dto.provider || this.providerFor(dto.channel);
    const status = provider === "manual" || provider === "cash" || provider === "bank" ? "pending" : "pending";

    return this.records.create(user, "paymentIntents", {
      ...dto,
      provider,
      status,
      currencyCode: dto.currencyCode || "GHS",
      currencySymbol: dto.currencySymbol || "GH₵",
      currencyName: dto.currencyName || "Ghanaian Cedi",
      active: true,
      isDeleted: false,
    });
  }

  updateIntent(user: AuthUser, id: string, dto: UpdatePaymentIntentDto) {
    return this.records.update(user, "paymentIntents", id, dto);
  }

  cancelIntent(user: AuthUser, id: string) {
    return this.records.update(user, "paymentIntents", id, {
      status: "cancelled",
      cancelledAt: nowIso(),
    });
  }

  listTransactions(user: AuthUser, schoolId?: number, branchId?: number) {
    return this.records.list(user, "paymentTransactions", { schoolId, branchId });
  }

  createTransaction(user: AuthUser, dto: CreatePaymentTransactionDto) {
    const paid = dto.status === "paid" || dto.status === "success" || dto.status === "succeeded" || !dto.status;

    return this.records.create(user, "paymentTransactions", {
      ...dto,
      status: dto.status || "paid",
      currencyCode: dto.currencyCode || "GHS",
      currencySymbol: dto.currencySymbol || "GH₵",
      currencyName: dto.currencyName || "Ghanaian Cedi",
      paidAt: paid ? nowIso() : undefined,
      active: true,
      isDeleted: false,
    });
  }

  async verifyReference(user: AuthUser, dto: VerifyProviderReferenceDto) {
    const transactions = await this.records.list(user, "paymentTransactions", { includeDeleted: false } as any);
    const found = transactions.find((row: any) => {
      return row.provider === dto.provider && row.providerReference === dto.reference;
    });

    if (!found) {
      throw new BadRequestException("Payment reference was not found in operational transactions.");
    }

    return { ok: true, transaction: found };
  }

  /**
   * Initializes a Paystack checkout for student/school-fee collection.
   * This is the equivalent of billing checkout, but for school money.
   */
  async initiatePayment(user: AuthUser, dto: InitializePaymentDto) {
    const provider = dto.provider || this.providerFor(dto.channel || "card");
    const amount = toNumber(dto.amount);
    const currencyCode = dto.currencyCode || "GHS";

    if (amount <= 0) {
      throw new BadRequestException("Payment amount must be greater than zero.");
    }

    if (provider !== "paystack") {
      return this.createIntent(user, {
        ...dto,
        provider,
        status: "pending",
      } as any);
    }

    const reference = clean((dto as any).referenceNumber || (dto as any).providerReference) || makeReference("SF");
    const callbackUrl = dto.callbackUrl || this.paystackCallbackUrl();
    const email = clean(dto.payerEmail || dto.email || `${user?.id || "student"}@eleeveon.local`);

    const intent = await this.records.create(user, "paymentIntents", {
      ...dto,
      provider: "paystack",
      channel: dto.channel || "card",
      status: "pending",
      referenceNumber: reference,
      providerReference: reference,
      amount,
      currencyCode,
      currencySymbol: dto.currencySymbol || "GH₵",
      currencyName: dto.currencyName || "Ghanaian Cedi",
      callbackUrl,
      metadata: {
        ...(dto.metadata || {}),
        purpose: dto.purpose || "student_fee",
        invoiceId: dto.invoiceId,
        studentId: dto.studentId,
        schoolId: dto.schoolId,
        branchId: dto.branchId,
        accountId: (user as any)?.accountId,
      },
      active: true,
      isDeleted: false,
    } as any);

    const paystack = await this.paystackRequest("/transaction/initialize", {
      method: "POST",
      body: {
        email,
        amount: pesewas(amount),
        currency: currencyCode,
        reference,
        callback_url: callbackUrl,
        channels: dto.channel === "momo" ? ["mobile_money"] : undefined,
        metadata: {
          intentId: (intent as any)?.id || (intent as any)?.cloudRecordId,
          purpose: dto.purpose || "student_fee",
          invoiceId: dto.invoiceId,
          studentId: dto.studentId,
          schoolId: dto.schoolId,
          branchId: dto.branchId,
          accountId: (user as any)?.accountId,
          payerName: dto.payerName,
          payerPhone: dto.payerPhone,
        },
      },
    });

    return {
      ok: true,
      intent,
      provider: "paystack",
      reference,
      authorizationUrl: paystack?.data?.authorization_url,
      accessCode: paystack?.data?.access_code,
      raw: paystack,
    };
  }

  /**
   * Verifies a Paystack checkout reference.
   * FinanceService should call this before creating studentFeePayments.
   */
  async verifyPayment(user: AuthUser, dto: VerifyPaymentDto) {
    if (!dto.reference) {
      throw new BadRequestException("Payment reference is required.");
    }

    if ((dto.provider || "paystack") !== "paystack") {
      return this.verifyReference(user, dto);
    }

    const verified = await this.paystackRequest(`/transaction/verify/${encodeURIComponent(dto.reference)}`, {
      method: "GET",
    });

    const data = verified?.data || {};
    const paid = String(data.status || "").toLowerCase() === "success";

    const intents = await this.records.list(user, "paymentIntents", { includeDeleted: false } as any);
    const intent = intents.find((row: any) => row.provider === "paystack" && row.providerReference === dto.reference);

    if (intent) {
      await this.records.update(user, "paymentIntents", String(intent.id || intent.cloudRecordId || intent.cloudId), {
        status: paid ? "paid" : data.status || "failed",
        verifiedAt: nowIso(),
        providerPayload: data,
      });
    }

    return {
      ok: paid,
      status: paid ? "paid" : data.status || "failed",
      provider: "paystack",
      reference: dto.reference,
      amount: toNumber(data.amount) / 100,
      currencyCode: data.currency || "GHS",
      channel: data.channel,
      paidAt: data.paid_at || nowIso(),
      customer: data.customer,
      metadata: data.metadata || {},
      intent,
      raw: verified,
    };
  }

  /**
   * Creates/reuses a Paystack transfer recipient from payout settings.
   * Used before initiating a withdrawal/cash-out.
   */
  async createTransferRecipient(user: AuthUser, destination: TransferDestination) {
    if (destination.paystackRecipientCode) {
      return {
        ok: true,
        recipientCode: destination.paystackRecipientCode,
        reused: true,
      };
    }

    const method = clean(destination.preferredMethod || "bank").toLowerCase();

    if (method === "momo") {
      if (!destination.momoName || !destination.momoNumber || !destination.momoNetwork) {
        throw new BadRequestException("Complete momo payout settings before creating transfer recipient.");
      }

      const recipient = await this.paystackRequest("/transferrecipient", {
        method: "POST",
        body: {
          type: "mobile_money",
          name: destination.momoName,
          account_number: destination.momoNumber,
          bank_code: this.paystackMomoBankCode(destination.momoNetwork),
          currency: "GHS",
          metadata: {
            accountName: destination.momoName,
            network: destination.momoNetwork,
            createdBy: user?.id,
          },
        },
      });

      return {
        ok: true,
        recipientCode: recipient?.data?.recipient_code,
        raw: recipient,
      };
    }

    if (!destination.bankAccountName || !destination.bankAccountNumber) {
      throw new BadRequestException("Complete bank payout settings before creating transfer recipient.");
    }

    const bankCode = clean(destination.bankCode);

    if (!bankCode) {
      throw new BadRequestException("Bank code is required for Paystack bank transfers. Store bankCode in payout settings.");
    }

    const recipient = await this.paystackRequest("/transferrecipient", {
      method: "POST",
      body: {
        type: "nuban",
        name: destination.bankAccountName,
        account_number: destination.bankAccountNumber,
        bank_code: bankCode,
        currency: "GHS",
        metadata: {
          bankName: destination.bankName,
          accountName: destination.bankAccountName,
          createdBy: user?.id,
        },
      },
    });

    return {
      ok: true,
      recipientCode: recipient?.data?.recipient_code,
      raw: recipient,
    };
  }

  /**
   * Initiates a real Paystack transfer/cash-out.
   * FinanceService.withdrawals should call this.
   */
  async initiateTransfer(user: AuthUser, dto: InitiateTransferDto) {
    const amount = toNumber(dto.amount);

    if (amount <= 0) {
      throw new BadRequestException("Withdrawal amount must be greater than zero.");
    }

    const recipient = await this.createTransferRecipient(user, dto.destination);
    const reference = dto.referenceNumber || makeReference("WD");

    const transfer = await this.paystackRequest("/transfer", {
      method: "POST",
      body: {
        source: "balance",
        amount: pesewas(amount),
        recipient: recipient.recipientCode,
        reason: dto.reason || "Eleeveon school fee withdrawal",
        reference,
        metadata: {
          ...(dto.metadata || {}),
          schoolId: dto.schoolId,
          branchId: dto.branchId,
          purpose: "school_fee_withdrawal",
        },
      },
    });

    const status = transfer?.data?.status || "processing";

    const transaction = await this.records.create(user, "paymentTransactions", {
      schoolId: dto.schoolId,
      branchId: dto.branchId,
      purpose: "school_fee_withdrawal",
      direction: "outflow",
      amount,
      channel: dto.destination.preferredMethod || "bank",
      provider: "paystack",
      status: this.normalizeTransferStatus(status),
      referenceNumber: reference,
      providerReference: transfer?.data?.transfer_code || reference,
      recipientCode: recipient.recipientCode,
      currencyCode: dto.currencyCode || "GHS",
      currencySymbol: "GH₵",
      currencyName: "Ghanaian Cedi",
      note: dto.reason,
      providerPayload: transfer?.data,
      active: true,
      isDeleted: false,
    } as any);

    return {
      ok: true,
      status: this.normalizeTransferStatus(status),
      referenceNumber: reference,
      providerReference: transfer?.data?.transfer_code,
      recipientCode: recipient.recipientCode,
      transaction,
      raw: transfer,
    };
  }

  private providerFor(channel: string) {
    if (channel === "momo" || channel === "card") return "paystack";
    if (channel === "cash") return "cash";
    if (channel === "bank") return "bank";
    return "manual";
  }

  private normalizeTransferStatus(status?: string) {
    const value = clean(status).toLowerCase();

    if (["success", "successful", "completed"].includes(value)) return "paid";
    if (["pending", "otp", "processing", "received"].includes(value)) return "processing";
    if (["failed", "reversed", "rejected"].includes(value)) return "failed";

    return value || "processing";
  }

  /**
   * Paystack bank codes for Ghana mobile-money transfer recipients.
   * Confirm these in live mode before production rollout.
   */
  private paystackMomoBankCode(network?: string) {
    const value = clean(network).toLowerCase();

    if (value.includes("mtn")) return "MTN";
    if (value.includes("telecel") || value.includes("vodafone")) return "VOD";
    if (value.includes("airteltigo") || value.includes("airtel") || value.includes("tigo")) return "ATL";

    return value.toUpperCase();
  }

  private paystackMode() {
    const mode = clean(this.config.get<string>("PAYSTACK_MODE") || process.env.PAYSTACK_MODE || "test").toLowerCase();
    return mode === "live" || mode === "production" ? "live" : "test";
  }

  private paystackSecretKey() {
    const mode = this.paystackMode();

    const secret =
      mode === "live"
        ? this.config.get<string>("PAYSTACK_LIVE_SECRET_KEY") || process.env.PAYSTACK_LIVE_SECRET_KEY
        : this.config.get<string>("PAYSTACK_TEST_SECRET_KEY") || process.env.PAYSTACK_TEST_SECRET_KEY;

    const fallback = this.config.get<string>("PAYSTACK_SECRET_KEY") || process.env.PAYSTACK_SECRET_KEY;
    const resolved = clean(secret || fallback);

    if (!resolved) {
      throw new BadRequestException(`Paystack secret key missing for PAYSTACK_MODE=${mode}.`);
    }

    return resolved;
  }

  private paystackCallbackUrl() {
    const mode = this.paystackMode();

    const callbackUrl =
      mode === "live"
        ? this.config.get<string>("PAYSTACK_LIVE_CALLBACK_URL") || process.env.PAYSTACK_LIVE_CALLBACK_URL
        : this.config.get<string>("PAYSTACK_TEST_CALLBACK_URL") || process.env.PAYSTACK_TEST_CALLBACK_URL;

    return clean(callbackUrl || this.config.get<string>("PAYSTACK_CALLBACK_URL") || process.env.PAYSTACK_CALLBACK_URL) || undefined;
  }

  private async paystackRequest(path: string, options: { method: "GET" | "POST"; body?: AnyRecord }) {
    const secret = this.paystackSecretKey();

    const res = await fetch(`https://api.paystack.co${path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || json?.status === false) {
      throw new BadRequestException(json?.message || `Paystack request failed: ${path}`);
    }

    return json;
  }
}
