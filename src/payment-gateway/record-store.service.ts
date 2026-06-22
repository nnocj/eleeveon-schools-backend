import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../common/auth-user";
import {
  assertSameAccountOrDeveloper,
  userCanAccessSchoolBranch,
} from "../common/scope";

/**
 * src/payment-gateway/record-store.service.ts
 * ---------------------------------------------------------
 * OPERATIONAL RECORD STORE
 * ---------------------------------------------------------
 *
 * Stores operational finance/communication/payroll records inside SyncRecord.
 *
 * Wallet/payout update:
 * - schoolPayoutSettings is now a supported operational table.
 * - withdrawalRequests is now a supported operational table.
 * - paymentSettlements is now a supported operational table.
 *
 * This keeps the backend type-safe while allowing FinanceService to read/write
 * the new branch wallet and withdrawal records without "as any" casts.
 */

export type OperationalTableName =
  | "currencies"
  | "schoolCurrencySettings"

  // Branch wallet / payout / settlement records.
  | "schoolPayoutSettings"
  | "withdrawalRequests"
  | "paymentSettlements"

  | "paymentIntents"
  | "paymentTransactions"
  | "paymentProviderEvents"
  | "paymentRefunds"
  | "studentFeeInvoices"
  | "studentFeeInvoiceItems"
  | "studentFeePayments"
  | "staffPayrollProfiles"
  | "payrollRuns"
  | "payrollItems"
  | "staffPaymentRecords"
  | "announcements"
  | "announcementRecipients"
  | "messageThreads"
  | "messages"
  | "communicationLogs"
  | "notificationTemplates";

export type ScopeFilter = {
  schoolId?: number;
  branchId?: number;
  includeDeleted?: boolean;
};

@Injectable()
export class RecordStoreService {
  constructor(private readonly prisma: PrismaService) {}

  now() {
    return Date.now();
  }

  private assertScope(user: AuthUser, payload: any) {
    assertSameAccountOrDeveloper(user, payload?.accountId || user.accountId);

    const schoolId = payload?.schoolId == null ? undefined : Number(payload.schoolId);
    const branchId = payload?.branchId == null ? undefined : Number(payload.branchId);

    if (!userCanAccessSchoolBranch({ user, schoolId, branchId })) {
      throw new ForbiddenException("You cannot access this school branch.");
    }
  }

  private normalizePayload(user: AuthUser, payload: any) {
    const next = {
      ...(payload || {}),
      accountId: user.accountId,
      updatedAt: this.now(),
      isDeleted: payload?.isDeleted ?? false,
    };

    if (!next.createdAt) next.createdAt = next.updatedAt;
    if (!next.version) next.version = 1;
    if (!next.synced) next.synced = "synced";

    this.assertScope(user, next);
    return next;
  }

  private recordToPayload(record: any) {
    return {
      ...(record.payload || {}),
      cloudRecordId: record.id,
      cloudId: record.cloudId,
      tableName: record.tableName,
      version: Number(record.version || (record.payload as any)?.version || 1),
    };
  }

  async list(user: AuthUser, tableName: OperationalTableName, scope: ScopeFilter = {}) {
    assertSameAccountOrDeveloper(user, user.accountId);

    const records = await this.prisma.syncRecord.findMany({
      where: {
        accountId: user.accountId,
        tableName,
      },
      orderBy: { createdAt: "desc" },
    });

    return records
      .map((record) => this.recordToPayload(record))
      .filter((payload: any) => {
        if (!scope.includeDeleted && payload.isDeleted) return false;
        if (scope.schoolId != null && Number(payload.schoolId) !== Number(scope.schoolId)) return false;
        if (scope.branchId != null && Number(payload.branchId) !== Number(scope.branchId)) return false;
        return userCanAccessSchoolBranch({
          user,
          schoolId: payload.schoolId,
          branchId: payload.branchId,
        });
      });
  }

  async get(user: AuthUser, tableName: OperationalTableName, cloudRecordId: string) {
    const record = await this.prisma.syncRecord.findFirst({
      where: {
        id: cloudRecordId,
        accountId: user.accountId,
        tableName,
      },
    });

    if (!record) throw new NotFoundException("Record not found.");

    const payload = this.recordToPayload(record);
    this.assertScope(user, payload);
    return payload;
  }

  async create(user: AuthUser, tableName: OperationalTableName, payload: any) {
    const normalized = this.normalizePayload(user, payload);

    const record = await this.prisma.syncRecord.create({
      data: {
        accountId: user.accountId,
        tableName,
        localId: normalized.id || null,
        cloudId: normalized.cloudId || null,
        deviceId: normalized.deviceId || "server",
        version: Number(normalized.version || 1),
        updatedAt: BigInt(normalized.updatedAt),
        isDeleted: Boolean(normalized.isDeleted),
        payload: normalized,
      },
    });

    return this.recordToPayload(record);
  }

  async update(user: AuthUser, tableName: OperationalTableName, cloudRecordId: string, patch: any) {
    const existing = await this.prisma.syncRecord.findFirst({
      where: { id: cloudRecordId, accountId: user.accountId, tableName },
    });

    if (!existing) throw new NotFoundException("Record not found.");

    const existingPayload = (existing.payload || {}) as any;
    this.assertScope(user, existingPayload);

    const updated = this.normalizePayload(user, {
      ...existingPayload,
      ...(patch || {}),
      version: Number(existing.version || existingPayload.version || 1) + 1,
    });

    const record = await this.prisma.syncRecord.update({
      where: { id: existing.id },
      data: {
        localId: updated.id || existing.localId,
        cloudId: updated.cloudId || existing.cloudId,
        deviceId: updated.deviceId || existing.deviceId || "server",
        version: Number(updated.version || 1),
        updatedAt: BigInt(updated.updatedAt),
        isDeleted: Boolean(updated.isDeleted),
        payload: updated,
      },
    });

    return this.recordToPayload(record);
  }

  async softDelete(user: AuthUser, tableName: OperationalTableName, cloudRecordId: string) {
    return this.update(user, tableName, cloudRecordId, { isDeleted: true });
  }
}
