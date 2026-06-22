import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../common/auth-user";
import { RecordStoreService } from "../payment-gateway/record-store.service";
import { PaymentGatewayService } from "../payment-gateway/payment-gateway.service";
import { CreatePayrollItemDto, CreatePayrollProfileDto, CreatePayrollRunDto, PayPayrollItemDto, PayrollStatusDto } from "./dto/payroll.dto";

@Injectable()
export class PayrollService {
  constructor(
    private readonly records: RecordStoreService,
    private readonly payments: PaymentGatewayService
  ) {}

  async dashboard(user: AuthUser, schoolId?: number, branchId?: number) {
    const [profiles, runs, items, payments] = await Promise.all([
      this.records.list(user, "staffPayrollProfiles", { schoolId, branchId }),
      this.records.list(user, "payrollRuns", { schoolId, branchId }),
      this.records.list(user, "payrollItems", { schoolId, branchId }),
      this.records.list(user, "staffPaymentRecords", { schoolId, branchId }),
    ]);

    return {
      profileCount: profiles.length,
      runCount: runs.length,
      itemCount: items.length,
      paymentCount: payments.length,
      totalNet: items.reduce((sum: number, row: any) => sum + Number(row.netAmount || 0), 0),
      totalPaid: payments.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0),
    };
  }

  listProfiles(user: AuthUser, schoolId?: number, branchId?: number) {
    return this.records.list(user, "staffPayrollProfiles", { schoolId, branchId });
  }

  createProfile(user: AuthUser, dto: CreatePayrollProfileDto) {
    return this.records.create(user, "staffPayrollProfiles", {
      ...dto,
      currencyCode: dto.currencyCode || "GHS",
      currencySymbol: dto.currencySymbol || "GH₵",
      currencyName: dto.currencyName || "Ghanaian Cedi",
      active: true,
    });
  }

  updateProfile(user: AuthUser, id: string, dto: Partial<CreatePayrollProfileDto>) {
    return this.records.update(user, "staffPayrollProfiles", id, dto);
  }

  listRuns(user: AuthUser, schoolId?: number, branchId?: number) {
    return this.records.list(user, "payrollRuns", { schoolId, branchId });
  }

  createRun(user: AuthUser, dto: CreatePayrollRunDto) {
    return this.records.create(user, "payrollRuns", {
      ...dto,
      status: "draft",
      grossAmount: 0,
      totalAllowances: 0,
      totalDeductions: 0,
      netAmount: 0,
      amountPaid: 0,
      currencyCode: dto.currencyCode || "GHS",
      currencySymbol: dto.currencySymbol || "GH₵",
      currencyName: dto.currencyName || "Ghanaian Cedi",
      locked: false,
    });
  }

  updateRunStatus(user: AuthUser, id: string, dto: PayrollStatusDto) {
    const patch: any = { status: dto.status };
    if (dto.status === "approved") patch.approvedAt = new Date().toISOString();
    if (dto.status === "processing") patch.processedAt = new Date().toISOString();
    return this.records.update(user, "payrollRuns", id, patch);
  }

  listItems(user: AuthUser, schoolId?: number, branchId?: number) {
    return this.records.list(user, "payrollItems", { schoolId, branchId });
  }

  createItem(user: AuthUser, dto: CreatePayrollItemDto) {
    const allowances = Number(dto.allowances || 0) + Number(dto.bonus || 0);
    const deductions = Number(dto.deductions || 0) + Number(dto.tax || 0);
    const grossAmount = Number(dto.baseSalary || 0) + allowances;
    const netAmount = Math.max(0, grossAmount - deductions);

    return this.records.create(user, "payrollItems", {
      ...dto,
      allowances,
      deductions,
      grossAmount,
      netAmount,
      status: "pending",
      currencyCode: dto.currencyCode || "GHS",
      currencySymbol: dto.currencySymbol || "GH₵",
      currencyName: dto.currencyName || "Ghanaian Cedi",
    });
  }

  async payItem(user: AuthUser, id: string, dto: PayPayrollItemDto) {
    const item = await this.records.get(user, "payrollItems", id) as any;

    const payment = await this.records.create(user, "staffPaymentRecords", {
      schoolId: item.schoolId,
      branchId: item.branchId,
      teacherId: item.teacherId,
      staffUserId: item.staffUserId,
      payrollRunId: item.payrollRunId,
      payrollItemId: item.id || item.cloudRecordId,
      amount: item.netAmount,
      method: dto.method || item.paymentMethod || "manual",
      provider: dto.provider || item.provider || "manual",
      status: "paid",
      recipientName: item.fullName,
      referenceNumber: dto.referenceNumber,
      receiptNumber: dto.receiptNumber,
      providerReference: dto.providerReference,
      date: new Date().toISOString().slice(0, 10),
      paidAt: new Date().toISOString(),
      note: dto.note,
      currencyCode: item.currencyCode || "GHS",
      currencySymbol: item.currencySymbol || "GH₵",
      currencyName: item.currencyName || "Ghanaian Cedi",
    });

    await this.payments.createTransaction(user, {
      schoolId: item.schoolId,
      branchId: item.branchId,
      purpose: "payroll",
      direction: "outflow",
      amount: item.netAmount,
      channel: dto.method || item.paymentMethod || "manual",
      provider: dto.provider || item.provider || "manual",
      status: "paid",
      recipientName: item.fullName,
      referenceNumber: dto.referenceNumber,
      receiptNumber: dto.receiptNumber,
      providerReference: dto.providerReference,
      currencyCode: item.currencyCode,
      currencySymbol: item.currencySymbol,
      currencyName: item.currencyName,
      note: dto.note,
    } as any);

    await this.records.update(user, "payrollItems", id, {
      status: "paid",
      paidAt: new Date().toISOString(),
      paymentMethod: dto.method || item.paymentMethod || "manual",
      provider: dto.provider || item.provider || "manual",
      referenceNumber: dto.referenceNumber,
      receiptNumber: dto.receiptNumber,
      providerReference: dto.providerReference,
    });

    return payment;
  }
}
