import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  PlatformCacheDto,
  PullSyncDto,
  PushSyncDto,
  RegisterSyncDeviceDto,
  ResolveSyncConflictDto,
  SyncPushRecordDto,
} from "./dto/sync.dto";

type SyncResult = {
  tableName: string;
  localId: number;
  cloudId?: string;
  version: number;
  updatedAt: number;
  ok: boolean;
  error?: string;
  conflictId?: string;
};

/**
 * Browser-push allow-list for local-first Dexie tables.
 *
 * IMPORTANT:
 * This backend list must match the frontend local-first sync registry.
 * If a table exists in Dexie/PUSH_SYNC_TABLES but is missing here,
 * pushSync will fail with: "<table> is not allowed to be pushed from the browser."
 */
const LOCAL_FIRST_TABLES = new Set([
  "schools",
  "branches",
  "academicStructures",
  "academicPeriods",
  "organizations",
  "students",
  "teachers",
  "parents",
  "studentParents",
  "classes",
  "subjects",
  "programs",
  "curriculums",
  "curriculumPathways",
  "curriculumSubjects",
  "classSubjects",
  "subjectPrerequisites",
  "studentCurriculums",
  "subjectOfferings",
  "assignments",
  "classTeachers",
  "studentEnrollments",
  "gradingSystems",
  "gradeRules",
  "assessmentStructures",
  "assessmentStructureItems",
  "assessmentApplicabilities",
  "assessmentComponents",
  "assessmentEntries",
  "computedResults",
  "attendance",
  "teacherAttendance",
  "reportCards",
  "reportCardItems",
  "studentReportSnapshots",
  "studentPromotions",
  "feeStructures",
  "payments",
  "incomes",
  "expenses",
  "currencies",
  "schoolCurrencySettings",

  // Branch wallet / payout local-first records.
  // Keep this aligned with frontend syncTables.ts and Dexie db.ts.
  "schoolPayoutSettings",
  "paymentSettlements",
  "withdrawalRequests",

  "paymentIntents",
  "paymentTransactions",
  "paymentProviderEvents",
  "paymentRefunds",
  "studentFeeInvoices",
  "studentFeeInvoiceItems",
  "studentFeePayments",
  "staffPayrollProfiles",
  "payrollRuns",
  "payrollItems",
  "staffPaymentRecords",
  "announcements",
  "announcementRecipients",
  "messageThreads",
  "messages",
  "communicationLogs",
  "notificationTemplates",

  // Media asset metadata is local-first and safe to push.
  // Heavy binary/blob data must stay out of normal SyncRecord payloads.
  "mediaAssets",

  "schoolBranchSettings",
  "calendarEvents",
  "calendarEventParticipants",
  "calendarEventReminders",
  "calendarEventResponses",
  "scheduleTimetables",
  "scheduleSessions",
  "scheduleResources",
  "scheduleConflicts",
]);

const BLOCKED_PUSH_TABLES = new Set([
  "accounts",
  "appUsers",
  "userMemberships",
  "permissionRules",
  "subscriptionPlans",
  "accountSubscriptions",
  "invoices",
  "appPayments",
  "billingEvents",
  "syncDevices",
  "syncConflicts",
  "apiClients",
  "apiKeys",
  "webhooks",
  "webhookLogs",
  "integrationMappings",
  "auditLogs",
  "backgroundJobs",
  "storageUsage",
  "accountFeatureFlags",
  "accountSystemSettings",
  "notificationDeliveryLogs",
  "userSessions",

  // Browser-local binary storage must never be pushed through SyncRecord.
  // Only mediaAssets metadata may use normal sync.
  "mediaBlobs",
]);

const MEDIA_ASSETS_TABLE = "mediaAssets";

/**
 * Safe media fields that SHOULD sync across devices.
 *
 * mediaBlobs remain browser-local, so another device can only display an
 * updated image if mediaAssets carries one of:
 * - previewDataUrl
 * - thumbnailDataUrl
 * - remoteUrl/publicUrl
 */
const SAFE_MEDIA_SYNC_FIELDS = new Set([
  "previewDataUrl",
  "thumbnailDataUrl",
  "remoteUrl",
  "publicUrl",
  "remoteKey",
  "remoteProvider",
  "uploadStatus",
  "uploadedAt",
  "uploadError",
  "lastUploadAttemptAt",
]);

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async status(user?: { accountId?: string; email?: string; role?: string }) {
    return {
      ok: true,
      service: "Eleeveon Sync Service",
      accountId: user?.accountId,
      user: user?.email,
      role: user?.role,
      serverTime: Date.now(),
    };
  }

  async push(dto: PushSyncDto) {
    const results: SyncResult[] = [];
    const accountId = this.cleanId(dto.accountId);

    if (!accountId) {
      return {
        ok: false,
        results: [],
        serverTime: Date.now(),
        error: "Account session is missing. Please log out and sign in again.",
      };
    }

    await this.ensureAccount(accountId);
    await this.touchDevice({ accountId, deviceId: dto.deviceId, lastPushAt: new Date() });

    for (const record of dto.records || []) {
      try {
        const tableName = this.cleanTableName(record.tableName);

        if (!tableName) throw new BadRequestException("Missing table name.");

        if (BLOCKED_PUSH_TABLES.has(tableName) || !LOCAL_FIRST_TABLES.has(tableName)) {
          throw new ForbiddenException(`${tableName} is not allowed to be pushed from the browser.`);
        }

        const normalizedRecord: SyncPushRecordDto = {
          ...record,
          tableName,
          accountId,
          cloudId: this.cleanString(record.cloudId),
          deviceId: this.cleanString(record.deviceId || dto.deviceId),
          version: Number(record.version || 1),
          updatedAt: Number(record.updatedAt || Date.now()),
          isDeleted: Boolean(record.isDeleted),
          payload: this.sanitizePayload(record.payload || {}, tableName),
        };

        const saved = await this.upsertRecord(normalizedRecord);

        results.push({
          tableName,
          localId: normalizedRecord.localId,
          cloudId: saved.id,
          version: saved.version,
          updatedAt: Number(saved.updatedAt),
          ok: true,
        });
      } catch (error: any) {
        results.push({
          tableName: record.tableName,
          localId: Number(record.localId || 0),
          cloudId: this.cleanString(record.cloudId) || undefined,
          version: Number(record.version || 1),
          updatedAt: Number(record.updatedAt || Date.now()),
          ok: false,
          error: this.safeSyncError(error),
        });
      }
    }

    return { ok: results.every((item) => item.ok), results, serverTime: Date.now() };
  }

  async pull(dto: PullSyncDto) {
    const accountId = this.cleanId(dto.accountId);

    if (!accountId) {
      return {
        records: [],
        serverTime: Date.now(),
        error: "Account session is missing. Please log out and sign in again.",
      };
    }

    await this.ensureAccount(accountId);
    await this.touchDevice({ accountId, deviceId: dto.deviceId, lastPullAt: new Date() });

    const requestedTables = Array.isArray(dto.tableNames)
      ? dto.tableNames.map((t) => this.cleanTableName(t)).filter(Boolean)
      : [];

    const tableFilter = requestedTables.length ? { in: requestedTables as string[] } : undefined;

    const records = await this.prisma.syncRecord.findMany({
      where: {
        accountId,
        updatedAt: { gt: BigInt(dto.since || 0) },
        ...(tableFilter ? { tableName: tableFilter } : {}),
      },
      orderBy: { updatedAt: "asc" },
      take: 5000,
    });

    return {
      records: records.map((record) => ({
        tableName: record.tableName,
        localId: record.localId,
        cloudId: record.id,
        accountId: record.accountId,
        deviceId: record.deviceId || undefined,
        version: record.version,
        updatedAt: Number(record.updatedAt),
        isDeleted: record.isDeleted,
        payload: record.payload,
      })),
      serverTime: Date.now(),
    };
  }

  async bootstrap(user: { id?: string; accountId?: string; email?: string; role?: string }, dto?: PlatformCacheDto) {
    const accountId = this.cleanId(dto?.accountId || user.accountId);
    if (!accountId) throw new BadRequestException("Account session is missing.");

    await this.ensureAccount(accountId);
    await this.touchDevice({ accountId, userId: user.id, deviceId: dto?.deviceId, lastSeenAt: new Date() });

    const [platformCache, syncStatus] = await Promise.all([
      this.platformCache({ accountId, deviceId: dto?.deviceId, since: dto?.since }),
      this.diagnostics(accountId),
    ]);

    return {
      ok: true,
      accountId,
      serverTime: Date.now(),
      platformCache,
      syncStatus,
    };
  }

  async platformCache(dto: PlatformCacheDto) {
    const accountId = this.cleanId(dto.accountId);
    if (!accountId) throw new BadRequestException("Account session is missing.");

    await this.ensureAccount(accountId);
    await this.touchDevice({ accountId, deviceId: dto.deviceId, lastSeenAt: new Date() });

    const sinceDate = dto.since ? new Date(Number(dto.since)) : undefined;

    const [
      account,
      users,
      memberships,
      permissionRules,
      subscriptionPlans,
      accountSubscription,
      invoices,
      payments,
      billingEvents,
      syncDevices,
      syncConflicts,
      apiClients,
      webhooks,
      webhookLogs,
      integrationMappings,
      auditLogs,
      backgroundJobs,
      storageUsage,
      featureFlags,
      systemSettings,
      notificationLogs,
    ] = await Promise.all([
      this.prisma.account.findUnique({ where: { id: accountId } }),
      this.prisma.appUser.findMany({ where: { accountId }, orderBy: { updatedAt: "desc" }, take: 1000 }),
      this.prisma.userMembership.findMany({ where: { accountId }, orderBy: { updatedAt: "desc" }, take: 2000 }),
      this.prisma.permissionRule.findMany({ where: { accountId }, orderBy: { updatedAt: "desc" } }),
      this.prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { priceMonthly: "asc" } }),
      this.prisma.accountSubscription.findUnique({ where: { accountId }, include: { plan: true } }),
      this.prisma.invoice.findMany({ where: { accountId, ...(sinceDate ? { updatedAt: { gte: sinceDate } } : {}) }, orderBy: { updatedAt: "desc" }, take: 100 }),
      this.prisma.appPayment.findMany({ where: { accountId, ...(sinceDate ? { updatedAt: { gte: sinceDate } } : {}) }, orderBy: { updatedAt: "desc" }, take: 100 }),
      this.prisma.billingEvent.findMany({ where: { accountId, ...(sinceDate ? { createdAt: { gte: sinceDate } } : {}) }, orderBy: { createdAt: "desc" }, take: 100 }),
      this.prisma.syncDevice.findMany({ where: { accountId }, orderBy: { updatedAt: "desc" }, take: 100 }),
      this.prisma.syncConflict.findMany({ where: { accountId, status: { in: ["open", "resolved", "ignored"] } }, orderBy: { detectedAt: "desc" }, take: 100 }),
      this.prisma.apiClient.findMany({ where: { accountId }, orderBy: { updatedAt: "desc" }, take: 100 }),
      this.prisma.webhook.findMany({ where: { accountId }, orderBy: { updatedAt: "desc" }, take: 100 }),
      this.prisma.webhookLog.findMany({ where: { accountId }, orderBy: { createdAt: "desc" }, take: 100 }),
      this.prisma.integrationMapping.findMany({ where: { accountId, active: true }, orderBy: { updatedAt: "desc" }, take: 500 }),
      this.prisma.auditLog.findMany({ where: { accountId }, orderBy: { createdAt: "desc" }, take: 100 }),
      this.prisma.backgroundJob.findMany({ where: { accountId }, orderBy: { createdAt: "desc" }, take: 100 }),
      this.prisma.storageUsage.findUnique({ where: { accountId } }),
      this.prisma.accountFeatureFlag.findMany({ where: { accountId }, orderBy: { key: "asc" } }),
      this.prisma.accountSystemSetting.findMany({ where: { accountId }, orderBy: { key: "asc" } }),
      this.prisma.notificationDeliveryLog.findMany({ where: { accountId }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);

    const records: any[] = [];

    const add = (tableName: string, rowOrRows: any) => {
      const rows = Array.isArray(rowOrRows) ? rowOrRows : rowOrRows ? [rowOrRows] : [];

      for (const row of rows) {
        const payload = this.toPlain(row);

        records.push({
          tableName,
          id: payload.id || payload.accountId,
          cloudId: payload.id || payload.accountId,
          accountId,
          updatedAt: payload.updatedAt || payload.createdAt || Date.now(),
          isDeleted: false,
          payload,
        });
      }
    };

    add("accounts", account);
    add("appUsers", users.map((u: any) => ({ ...u, passwordHash: undefined })));
    add("userMemberships", memberships);
    add("permissionRules", permissionRules);
    add("subscriptionPlans", subscriptionPlans);
    add("accountSubscriptions", accountSubscription);
    add("invoices", invoices);
    add("appPayments", payments);
    add("billingEvents", billingEvents);
    add("syncDevices", syncDevices.map((d: any) => ({ ...d, deviceName: d.name || d.deviceName })));
    add("syncConflicts", syncConflicts);
    add("apiClients", apiClients);
    add("webhooks", webhooks.map((w: any) => ({ ...w, secretHash: undefined, secret: undefined })));
    add("webhookLogs", webhookLogs);
    add("integrationMappings", integrationMappings);
    add("auditLogs", auditLogs);
    add("backgroundJobs", backgroundJobs);
    add("storageUsage", storageUsage);
    add("accountFeatureFlags", featureFlags);
    add("accountSystemSettings", systemSettings);
    add("notificationDeliveryLogs", notificationLogs);

    return { ok: true, records, serverTime: Date.now() };
  }

  async registerDevice(user: { id?: string; accountId?: string }, dto: RegisterSyncDeviceDto) {
    const accountId = this.cleanId(dto.accountId || user.accountId);
    const deviceId = this.cleanString(dto.deviceId);

    if (!accountId || !deviceId) {
      throw new BadRequestException("accountId and deviceId are required.");
    }

    await this.ensureAccount(accountId);

    const device = await this.prisma.syncDevice.upsert({
      where: { accountId_deviceId: { accountId, deviceId } },
      update: {
        userId: dto.userId || user.id || undefined,
        name: dto.name || dto.deviceName || undefined,
        platform: dto.platform || "web",
        lastSeenAt: new Date(),
        active: true,
      },
      create: {
        accountId,
        userId: dto.userId || user.id || undefined,
        deviceId,
        name: dto.name || dto.deviceName || undefined,
        platform: dto.platform || "web",
        lastSeenAt: new Date(),
        active: true,
      },
    });

    return { ok: true, device: { ...this.toPlain(device), deviceName: device.name } };
  }

  async listConflicts(accountId?: string, status = "open") {
    const cleanAccountId = this.cleanId(accountId);
    if (!cleanAccountId) throw new BadRequestException("accountId is required.");

    const conflicts = await this.prisma.syncConflict.findMany({
      where: { accountId: cleanAccountId, ...(status ? { status } : {}) },
      orderBy: { detectedAt: "desc" },
      take: 200,
    });

    return { conflicts: conflicts.map((c) => this.toPlain(c)), serverTime: Date.now() };
  }

  async resolveConflict(accountId: string, conflictId: string, userId: string | undefined, dto: ResolveSyncConflictDto) {
    const conflict = await this.prisma.syncConflict.findUnique({ where: { id: conflictId } });

    if (!conflict || conflict.accountId !== accountId) {
      throw new NotFoundException("Conflict not found.");
    }

    const updated = await this.prisma.syncConflict.update({
      where: { id: conflictId },
      data: {
        status: "resolved",
        resolutionPayload: dto.resolutionPayload || conflict.serverPayload || conflict.clientPayload || undefined,
        note: dto.note || dto.resolution,
        resolvedAt: new Date(),
        resolvedByUserId: userId,
      },
    });

    return { ok: true, conflict: this.toPlain(updated) };
  }

  async diagnostics(accountId?: string) {
    const where = accountId ? { accountId } : {};

    const [total, deleted, conflicts, devices, tables] = await Promise.all([
      this.prisma.syncRecord.count({ where }),
      this.prisma.syncRecord.count({ where: { ...where, isDeleted: true } }),
      this.prisma.syncConflict.count({ where: { ...(accountId ? { accountId } : {}), status: "open" } }),
      this.prisma.syncDevice.count({ where: { ...(accountId ? { accountId } : {}), active: true } }),
      this.prisma.syncRecord.groupBy({
        by: ["tableName"],
        where,
        _count: { tableName: true },
        orderBy: { _count: { tableName: "desc" } },
      }),
    ]);

    return { total, deleted, conflicts, devices, tables };
  }

  private async ensureAccount(accountId: string) {
    const existing = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (existing) return existing;

    return this.prisma.account.create({
      data: { id: accountId, name: "Local Account", email: null, status: "active" },
    });
  }

  private async upsertRecord(record: SyncPushRecordDto) {
    const accountId = this.cleanId(record.accountId);

    if (!accountId) {
      throw new Error("Account session is missing. Please log out and sign in again.");
    }

    const cloudId = this.cleanString(record.cloudId);
    const deviceId = this.cleanString(record.deviceId);
    const now = Date.now();
    const updatedAt = BigInt(Number(record.updatedAt || now));

    const payload = {
      ...(record.payload || {}),
      accountId,
      cloudId: cloudId || record.payload?.cloudId,
    };

    const existing = await this.findExistingSyncRecord({
      accountId,
      tableName: record.tableName,
      cloudId,
      localId: record.localId,
      deviceId,
      payload,
    });

    if (existing) {
      if (existing.accountId !== accountId) {
        throw new Error("This synced record belongs to another account. Please clear local app data and sign in again.");
      }

      const incomingVersion = Number(record.version || 1);
      const incomingUpdatedAt = Number(record.updatedAt || now);
      const existingUpdatedAt = Number(existing.updatedAt);
      const incomingIsNewer = incomingVersion > existing.version || incomingUpdatedAt >= existingUpdatedAt;

      if (!incomingIsNewer) {
        const conflict = await this.recordConflict({ existing, incoming: record, reason: "version_conflict" });
        return { ...existing, conflictId: conflict?.id } as any;
      }

      const saved = await this.prisma.syncRecord.update({
        where: { id: existing.id },
        data: {
          tableName: record.tableName,
          localId: record.localId,
          cloudId: cloudId || existing.cloudId || existing.id,
          deviceId,
          version: incomingVersion,
          updatedAt,
          isDeleted: Boolean(record.isDeleted),
          payload: {
            ...payload,
            cloudId: cloudId || existing.cloudId || existing.id,
          },
        },
      });

      await this.afterUpsertRecord(saved, record);

      return saved;
    }

    const saved = await this.prisma.syncRecord.create({
      data: {
        accountId,
        tableName: record.tableName,
        localId: record.localId,
        cloudId: cloudId || undefined,
        deviceId,
        version: Number(record.version || 1),
        updatedAt,
        isDeleted: Boolean(record.isDeleted),
        payload,
      },
    });

    await this.afterUpsertRecord(saved, record);

    return saved;
  }

  private async findExistingSyncRecord(args: {
    accountId: string;
    tableName: string;
    cloudId?: string;
    localId?: number;
    deviceId?: string;
    payload: Record<string, any>;
  }) {
    if (args.cloudId) {
      const byCloudId = await this.prisma.syncRecord.findUnique({ where: { id: args.cloudId } });
      if (byCloudId) return byCloudId;
    }

    if (args.tableName === MEDIA_ASSETS_TABLE) {
      const mediaExisting = await this.findExistingMediaSyncRecord(args);
      if (mediaExisting) return mediaExisting;
    }

    return this.prisma.syncRecord.findFirst({
      where: {
        accountId: args.accountId,
        tableName: args.tableName,
        localId: args.localId,
        ...(args.deviceId ? { deviceId: args.deviceId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async findExistingMediaSyncRecord(args: {
    accountId: string;
    tableName: string;
    cloudId?: string;
    localId?: number;
    deviceId?: string;
    payload: Record<string, any>;
  }) {
    const payload = args.payload || {};
    const ownerTable = this.cleanString(payload.ownerTable);
    const fieldKey = this.cleanString(payload.fieldKey);
    const ownerCloudId = this.cleanString(payload.ownerCloudId);
    const ownerTempKey = this.cleanString(payload.ownerTempKey);
    const ownerLocalId = this.cleanNumber(payload.ownerLocalId);

    if (ownerTempKey && ownerTable && fieldKey) {
      const byTempKey = await this.prisma.syncRecord.findFirst({
        where: {
          accountId: args.accountId,
          tableName: MEDIA_ASSETS_TABLE,
          payload: {
            path: ["ownerTempKey"],
            equals: ownerTempKey,
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (byTempKey) return byTempKey;
    }

    if (ownerCloudId && ownerTable && fieldKey) {
      const byOwnerCloudId = await this.prisma.syncRecord.findFirst({
        where: {
          accountId: args.accountId,
          tableName: MEDIA_ASSETS_TABLE,
          payload: {
            path: ["ownerCloudId"],
            equals: ownerCloudId,
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (byOwnerCloudId) return byOwnerCloudId;
    }

    // Do not match mediaAssets by localId alone unless we also have strict owner identity.
    // Numeric local ids are different on each browser/device.
    if (ownerLocalId && ownerTable && fieldKey) {
      const candidates = await this.prisma.syncRecord.findMany({
        where: {
          accountId: args.accountId,
          tableName: MEDIA_ASSETS_TABLE,
          payload: {
            path: ["ownerLocalId"],
            equals: ownerLocalId,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      const match = candidates.find((row: any) => {
        const p = row.payload || {};
        return p.ownerTable === ownerTable && p.fieldKey === fieldKey;
      });

      if (match) return match;
    }

    return null;
  }

  private async afterUpsertRecord(saved: any, incoming: SyncPushRecordDto) {
    if (incoming.tableName !== MEDIA_ASSETS_TABLE) return;

    const payload = (saved.payload || {}) as Record<string, any>;

    // Ensure the saved payload contains the final cloud id so other devices can
    // resolve a stable global identity after pull.
    if (payload.cloudId !== saved.id) {
      await this.prisma.syncRecord.update({
        where: { id: saved.id },
        data: {
          cloudId: saved.cloudId || saved.id,
          payload: { ...payload, cloudId: saved.id },
        },
      });
    }

    await this.deactivateReplacedMediaAssets(saved);
  }

  private async deactivateReplacedMediaAssets(activeRecord: any) {
    const activePayload = (activeRecord.payload || {}) as Record<string, any>;
    const accountId = activeRecord.accountId;

    if (activeRecord.tableName !== MEDIA_ASSETS_TABLE) return;
    if (activeRecord.isDeleted || activePayload.active === false || activePayload.isDeleted) return;

    const ownerTable = this.cleanString(activePayload.ownerTable);
    const fieldKey = this.cleanString(activePayload.fieldKey);
    const ownerCloudId = this.cleanString(activePayload.ownerCloudId);
    const ownerLocalId = this.cleanNumber(activePayload.ownerLocalId);
    const ownerTempKey = this.cleanString(activePayload.ownerTempKey);

    if (!ownerTable || !fieldKey) return;
    if (!ownerCloudId && !ownerLocalId && !ownerTempKey) return;

    const candidates = await this.prisma.syncRecord.findMany({
      where: {
        accountId,
        tableName: MEDIA_ASSETS_TABLE,
        NOT: { id: activeRecord.id },
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });

    const now = BigInt(Date.now());
    const updates: Promise<any>[] = [];

    for (const candidate of candidates) {
      const payload = (candidate.payload || {}) as Record<string, any>;

      if (payload.ownerTable !== ownerTable) continue;
      if (payload.fieldKey !== fieldKey) continue;

      const sameOwner =
        (ownerCloudId && payload.ownerCloudId === ownerCloudId) ||
        (ownerTempKey && payload.ownerTempKey === ownerTempKey) ||
        (ownerLocalId && Number(payload.ownerLocalId || 0) === ownerLocalId);

      if (!sameOwner) continue;
      if (candidate.isDeleted || payload.isDeleted || payload.active === false) continue;

      updates.push(
        this.prisma.syncRecord.update({
          where: { id: candidate.id },
          data: {
            isDeleted: true,
            updatedAt: now,
            version: Number(candidate.version || 1) + 1,
            payload: {
              ...payload,
              active: false,
              isDeleted: true,
              replacedByCloudId: activeRecord.id,
              replacedAt: Number(now),
            },
          },
        })
      );
    }

    if (updates.length) {
      await Promise.all(updates);
    }
  }

  private async recordConflict(args: { existing: any; incoming: SyncPushRecordDto; reason: string }) {
    try {
      return await this.prisma.syncConflict.create({
        data: {
          accountId: args.existing.accountId,
          tableName: args.existing.tableName,
          localId: args.incoming.localId,
          cloudId: args.existing.id,
          deviceId: args.incoming.deviceId,
          conflictType: args.reason,
          status: "open",
          severity: "medium",
          serverPayload: args.existing.payload || {},
          clientPayload: args.incoming.payload || {},
        },
      });
    } catch {
      return null;
    }
  }

  private async touchDevice(args: {
    accountId: string;
    userId?: string;
    deviceId?: string | null;
    lastSeenAt?: Date;
    lastPushAt?: Date;
    lastPullAt?: Date;
  }) {
    const deviceId = this.cleanString(args.deviceId);
    if (!deviceId) return;

    try {
      await this.prisma.syncDevice.upsert({
        where: { accountId_deviceId: { accountId: args.accountId, deviceId } },
        update: {
          userId: args.userId || undefined,
          lastSeenAt: args.lastSeenAt || new Date(),
          lastPushAt: args.lastPushAt,
          lastPullAt: args.lastPullAt,
          active: true,
        },
        create: {
          accountId: args.accountId,
          userId: args.userId,
          deviceId,
          platform: "web",
          lastSeenAt: args.lastSeenAt || new Date(),
          lastPushAt: args.lastPushAt,
          lastPullAt: args.lastPullAt,
          active: true,
        },
      });
    } catch {
      // Device tracking should never break normal sync.
    }
  }

  private cleanString(value?: string | null) {
    const clean = String(value || "").trim();
    return clean.length ? clean : undefined;
  }

  private cleanId(value?: string | null) {
    return this.cleanString(value);
  }

  private cleanTableName(value?: string | null) {
    const clean = this.cleanString(value);
    if (!clean) return undefined;
    return clean.replace(/[^a-zA-Z0-9_]/g, "");
  }

  private cleanNumber(value?: number | string | null) {
    if (value === undefined || value === null || value === "") return undefined;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  private sanitizePayload(payload: Record<string, any>, tableName?: string) {
    const copy = { ...(payload || {}) };

    // Security-sensitive fields must never leave the server/browser boundary.
    delete copy.password;
    delete copy.passwordHash;
    delete copy.refreshToken;
    delete copy.refreshTokenHash;
    delete copy.keyHash;
    delete copy.secret;
    delete copy.secretHash;

    // Blob/file/browser-only data must never be stored inside SyncRecord payloads.
    delete copy.blob;
    delete copy.file;
    delete copy.fileBlob;
    delete copy.originalFile;
    delete copy.optimizedFile;
    delete copy.localBlob;
    delete copy.localBlobData;
    delete copy.data;
    delete copy.binary;
    delete copy.buffer;
    delete copy.arrayBuffer;
    delete copy.objectUrl;
    delete copy.localObjectUrl;
    delete copy.localPreviewUrl;
    delete copy.previewUrl;

    if (tableName === MEDIA_ASSETS_TABLE) {
      // For mediaAssets, previewDataUrl and thumbnailDataUrl are intentionally
      // preserved. They are the current cross-device image source until a
      // dedicated remote media storage/upload endpoint is introduced.
      for (const key of SAFE_MEDIA_SYNC_FIELDS) {
        if (payload[key] !== undefined) copy[key] = payload[key];
      }
    } else {
      // For ordinary school records, never allow accidental base64 media payloads.
      delete copy.base64;
      delete copy.thumbnailBase64;
      delete copy.previewDataUrl;
      delete copy.thumbnailDataUrl;
    }

    return copy;
  }

  private toPlain(value: any): any {
    if (value === null || value === undefined) return value;
    if (typeof value === "bigint") return Number(value);
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((v) => this.toPlain(v));

    if (typeof value === "object") {
      const out: any = {};
      for (const [key, val] of Object.entries(value)) {
        if (val !== undefined) out[key] = this.toPlain(val);
      }
      return out;
    }

    return value;
  }

  private safeSyncError(error: any) {
    return error?.message || "Sync failed for this record.";
  }
}
