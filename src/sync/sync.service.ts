import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../common/auth-user";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import {
  DEFAULT_SYNC_PULL_LIMIT,
  MAX_SYNC_PULL_LIMIT,
  PlatformCacheDto,
  PullSyncDto,
  PushSyncDto,
  RegisterSyncDeviceDto,
  ResolveSyncConflictDto,
  SyncPushRecordDto,
  WorkspaceBootstrapDto,
  type SyncPullCursor,
} from "./dto/sync.dto";

/**
 * Phase 4 pull pagination:
 * - stable cursor: updatedAt + id;
 * - bounded page sizes;
 * - deterministic ascending order;
 * - no timestamp-only record loss when many records share updatedAt.
 */

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

  // Report template system.
  // These must match the frontend LOCAL_FIRST_SYNC_TABLES registry.
  "reportCardTemplates",
  "reportCardTemplateSettings",
  "reportCardTemplateAssignments",

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
  "paymentProviderEvents",
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
  "storageUsages",
  "accountFeatureFlags",
  "accountSystemSettings",
  "notificationDeliveryLogs",
  "userSessions",

  // Browser-local binary storage must never be pushed through SyncRecord.
  // Only mediaAssets metadata may use normal sync.
  "mediaBlobs",

  // Local database protection stores must never enter browser SyncRecord push.
  "migrationJournal",
  "databaseRecoveryBackups",
  "syncQuarantine",
]);

const MEDIA_ASSETS_TABLE = "mediaAssets";

const SCHOOL_REQUIRED_TABLES = new Set([
  "branches",
  "academicStructures",
  "academicPeriods",
  "programs",
  "curriculums",
  "curriculumPathways",
  "curriculumSubjects",
  "subjectPrerequisites",
  "gradingSystems",
  "gradeRules",
  "assessmentStructures",
  "assessmentStructureItems",
  "reportCardTemplates",
  "reportCardTemplateSettings",
  "reportCardTemplateAssignments",
  "feeStructures",
  "schoolCurrencySettings",
  "schoolPayoutSettings",
]);

const BRANCH_REQUIRED_TABLES = new Set([
  "students",
  "teachers",
  "parents",
  "studentParents",
  "classes",
  "classSubjects",
  "classTeachers",
  "studentCurriculums",
  "subjectOfferings",
  "assignments",
  "studentEnrollments",
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
  "payments",
  "incomes",
  "expenses",
  "paymentIntents",
  "paymentTransactions",
  "paymentRefunds",
  "paymentSettlements",
  "withdrawalRequests",
  "studentFeeInvoices",
  "studentFeeInvoiceItems",
  "studentFeePayments",
  "staffPayrollProfiles",
  "payrollRuns",
  "payrollItems",
  "staffPaymentRecords",
  "schoolBranchSettings",
]);

/**
 * Strict mediaAssets payload allow-list.
 * Only safe metadata, previews and remote references cross devices.
 *
 * mediaBlobs remain browser-local, so another device can only display an
 * updated image if mediaAssets carries one of:
 * - previewDataUrl
 * - thumbnailDataUrl
 * - remoteUrl/publicUrl
 */
const SAFE_MEDIA_ASSET_FIELDS = new Set([
  "accountId",
  "schoolId",
  "branchId",
  "cloudId",
  "ownerTable",
  "ownerLocalId",
  "ownerCloudId",
  "ownerTempKey",
  "fieldKey",
  "ownerIdentityKey",
  "identityVersion",
  "fileName",
  "originalFileName",
  "extension",
  "mimeType",
  "assetKind",
  "sizeBytes",
  "originalSizeBytes",
  "width",
  "height",
  "durationMs",
  "checksum",
  "thumbnailDataUrl",
  "previewDataUrl",
  "remoteUrl",
  "publicUrl",
  "remoteKey",
  "remoteProvider",
  "uploadStatus",
  "uploadedAt",
  "lastUploadAttemptAt",
  "uploadError",
  "metadata",
  "active",
  "isDeleted",
  "createdAt",
  "updatedAt",
  "version",
  "deviceId",
]);

type WorkspaceBootstrapRole =
  | "developer"
  | "platform_team"
  | "super_admin"
  | "admin"
  | "school_admin"
  | "branch_admin"
  | "teacher"
  | "student"
  | "parent"
  | "accountant";

const WORKSPACE_BOOTSTRAP_TABLES: Record<
  WorkspaceBootstrapRole,
  readonly string[]
> = {
  developer: [
    "schools",
    "branches",
    "schoolBranchSettings",
  ],
  platform_team: [
    "schools",
    "branches",
    "schoolBranchSettings",
  ],
  // Administrative workspaces receive the complete local-first registry.
  // Never replace these with a hand-written subset; doing so previously omitted
  // organizations, mediaAssets and other branch modules.
  super_admin: [...LOCAL_FIRST_TABLES],
  admin: [...LOCAL_FIRST_TABLES],
  school_admin: [...LOCAL_FIRST_TABLES],
  branch_admin: [...LOCAL_FIRST_TABLES],
  teacher: [
    "schools",
    "branches",
    "schoolBranchSettings",
    "academicPeriods",
    "classes",
    "subjects",
    "classSubjects",
    "classTeachers",
    "assignments",
    "students",
    "studentEnrollments",
    "assessmentStructures",
    "assessmentStructureItems",
    "assessmentApplicabilities",
  ],
  student: [
    "schools",
    "branches",
    "schoolBranchSettings",
    "academicPeriods",
    "students",
    "studentEnrollments",
    "classes",
    "subjects",
    "classSubjects",
    "computedResults",
    "reportCards",
    "reportCardItems",
    "announcements",
  ],
  parent: [
    "schools",
    "branches",
    "schoolBranchSettings",
    "parents",
    "studentParents",
    "students",
    "studentEnrollments",
    "classes",
    "computedResults",
    "reportCards",
    "reportCardItems",
    "announcements",
  ],
  accountant: [...LOCAL_FIRST_TABLES],
};

/**
 * Phase 21 complete-workspace bootstrap does not impose a record-count cap.
 * Administrative workspaces must not open with a silently truncated branch.
 * HTTP body limits and infrastructure limits should be configured separately.
 */
const WORKSPACE_BOOTSTRAP_SCHEMA_VERSION = 2;


@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async status(user?: { accountId?: string; email?: string; role?: string }) {
    return {
      ok: true,
      service: "Eleeveon Sync Service",
      workspaceBootstrapSchemaVersion:
        WORKSPACE_BOOTSTRAP_SCHEMA_VERSION,
      accountId: user?.accountId,
      user: user?.email,
      role: user?.role,
      serverTime: Date.now(),
    };
  }

  async push(actor: AuthUser, dto: PushSyncDto) {
    const results: SyncResult[] = [];
    const changedTables = new Set<string>();
    const accountId = this.requireActorAccount(actor, dto.accountId);

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

        await this.validateIncomingSyncRecord(
          actor,
          normalizedRecord,
          accountId,
        );

        const saved = await this.upsertRecord(normalizedRecord);

        results.push({
          tableName,
          localId: normalizedRecord.localId,
          cloudId: saved.id,
          version: saved.version,
          updatedAt: Number(saved.updatedAt),
          ok: true,
        });

        changedTables.add(tableName);
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

    if (changedTables.size > 0) {
      this.realtime.emitAccountDataChanged({
        accountId,
        changedTables: [...changedTables],
        sourceDeviceId: dto.deviceId,
        metadata: {
          action: "sync-push",
          successfulRecords: results.filter((item) => item.ok).length,
        },
      });
    }

    return { ok: results.every((item) => item.ok), results, serverTime: Date.now() };
  }

  async pull(actor: AuthUser, dto: PullSyncDto) {
    const accountId = this.requireActorAccount(actor, dto.accountId);

    if (!accountId) {
      return {
        records: [],
        serverTime: Date.now(),
        hasMore: false,
        nextCursor: null,
        error: "Account session is missing. Please log out and sign in again.",
      };
    }

    await this.ensureAccount(accountId);
    await this.touchDevice({
      accountId,
      deviceId: dto.deviceId,
      lastPullAt: new Date(),
    });

    const requestedTables = Array.isArray(dto.tableNames)
      ? dto.tableNames
          .map((tableName) => this.cleanTableName(tableName))
          .filter((tableName): tableName is string => Boolean(tableName))
      : [];

    const allowedRequestedTables = requestedTables.filter((tableName) =>
      LOCAL_FIRST_TABLES.has(tableName),
    );

    const tableFilter = allowedRequestedTables.length
      ? { in: allowedRequestedTables }
      : undefined;

    const pageLimit = Math.min(
      MAX_SYNC_PULL_LIMIT,
      Math.max(
        1,
        Number(dto.limit || DEFAULT_SYNC_PULL_LIMIT),
      ),
    );

    const cursor = this.resolvePullCursor(dto);

    /**
     * Fetch one extra row.
     *
     * The extra row is not returned. Its presence tells the client that a
     * following page exists without requiring an additional count query.
     */
    const fetched = await this.prisma.syncRecord.findMany({
      where: {
        accountId,

        ...(cursor
          ? {
              OR: [
                {
                  updatedAt: {
                    gt: BigInt(cursor.updatedAt),
                  },
                },
                {
                  AND: [
                    {
                      updatedAt: BigInt(cursor.updatedAt),
                    },
                    {
                      id: {
                        gt: cursor.id,
                      },
                    },
                  ],
                },
              ],
            }
          : dto.since
            ? {
                updatedAt: {
                  gt: BigInt(Number(dto.since)),
                },
              }
            : {}),

        ...(tableFilter
          ? {
              tableName: tableFilter,
            }
          : {}),
      },

      orderBy: [
        {
          updatedAt: "asc",
        },
        {
          id: "asc",
        },
      ],

      take: pageLimit + 1,
    });

    const hasMore = fetched.length > pageLimit;
    const page = hasMore
      ? fetched.slice(0, pageLimit)
      : fetched;

    /**
     * Advance the cursor across the complete stored page, including malformed
     * rows. Malformed rows are returned separately for local syncQuarantine so
     * they cannot block every later valid record forever.
     */
    const lastRecord = page.length
      ? page[page.length - 1]
      : null;

    const nextCursor: SyncPullCursor | null = lastRecord
      ? {
          updatedAt: Number(lastRecord.updatedAt),
          id: lastRecord.id,
        }
      : cursor;

    const validRecords: any[] = [];
    const quarantineRecords: any[] = [];

    for (const record of page) {
      const integrity =
        await this.validateStoredPullRecord(
          actor,
          record,
          accountId,
        );

      const plainRecord = {
        tableName: record.tableName,
        localId: record.localId,
        cloudId: record.id,
        accountId: record.accountId,
        deviceId:
          record.deviceId ||
          undefined,
        version: record.version,
        updatedAt:
          Number(record.updatedAt),
        isDeleted:
          record.isDeleted,
        payload: record.payload,
      };

      if (integrity.ok) {
        validRecords.push(
          plainRecord,
        );
      } else {
        quarantineRecords.push({
          reason:
            integrity.reason,
          record:
            plainRecord,
        });
      }
    }

    return {
      records: validRecords,
      quarantineRecords,
      serverTime: Date.now(),
      hasMore,
      nextCursor,
      pageSize: page.length,
      validPageSize:
        validRecords.length,
      quarantinedPageSize:
        quarantineRecords.length,
      requestedLimit: pageLimit,
    };
  }


  /**
   * Phase 21 priority workspace bootstrap.
   *
   * This endpoint is intentionally separate from the ordinary incremental pull:
   * - the authenticated JWT account remains authoritative;
   * - one active membership selects the permitted workspace;
   * - only role-essential tables are returned;
   * - records are tenant-scoped and integrity-validated;
   * - the client can apply the complete bundle in one Dexie transaction before
   *   opening the selected portal.
   */
  async workspaceBootstrap(
    actor: AuthUser,
    dto: WorkspaceBootstrapDto,
  ) {
    const accountId =
      this.requireActorAccount(
        actor,
        dto.accountId,
      );

    await this.ensureAccount(
      accountId,
    );

    await this.touchDevice({
      accountId,
      userId: actor.id,
      deviceId: dto.deviceId,
      lastPullAt: new Date(),
      lastSeenAt: new Date(),
    });

    const membership =
      await this.resolveWorkspaceMembership(
        actor,
        dto,
      );

    const role =
      this.normalizeWorkspaceRole(
        dto.role ||
          membership.role ||
          actor.role,
      );

    const schoolId =
      this.cleanNumber(
        dto.schoolId ??
          membership.schoolId,
      );

    const branchId =
      this.cleanNumber(
        dto.branchId ??
          membership.branchId,
      );

    const teacherLocalId =
      this.cleanNumber(
        dto.teacherLocalId ??
          membership.teacherLocalId,
      );

    const studentLocalId =
      this.cleanNumber(
        dto.studentLocalId ??
          membership.studentLocalId,
      );

    const parentLocalId =
      this.cleanNumber(
        dto.parentLocalId ??
          membership.parentLocalId,
      );

    await this.assertWorkspaceScope({
      actor,
      role,
      schoolId,
      branchId,
      teacherLocalId,
      studentLocalId,
      parentLocalId,
    });

    const tables =
      this.workspaceBootstrapTables(
        role,
        dto.tableNames,
      );

    const fetched =
      await this.prisma.syncRecord.findMany({
        where: {
          accountId,
          tableName: {
            in: tables,
          },
        },
        orderBy: [
          {
            updatedAt: "asc",
          },
          {
            id: "asc",
          },
        ],
      });

    const scoped =
      this.filterWorkspaceBootstrapRecords(
        fetched,
        {
          role,
          schoolId,
          branchId,
          teacherLocalId,
          studentLocalId,
          parentLocalId,
        },
      );

    const records: any[] = [];
    const quarantineRecords: any[] = [];
    const changedTables =
      new Set<string>();

    const tableCounts: Record<string, number> = {};

    for (const record of scoped) {
      const integrity =
        await this.validateStoredPullRecord(
          actor,
          record,
          accountId,
        );

      const plain =
        this.toBootstrapPullRecord(
          record,
        );

      if (integrity.ok) {
        records.push(plain);
        changedTables.add(
          record.tableName,
        );
        tableCounts[record.tableName] =
          (tableCounts[record.tableName] || 0) + 1;
      } else {
        quarantineRecords.push({
          reason:
            integrity.reason ||
            "INVALID_BOOTSTRAP_RECORD",
          record: plain,
        });
      }
    }

    const workspace =
      this.buildWorkspaceSummary(
        records,
        {
          role,
          schoolId,
          branchId,
          teacherLocalId,
          studentLocalId,
          parentLocalId,
        },
      );

    const platformCache =
      await this.lightweightWorkspacePlatformCache(
        actor,
        accountId,
      );

    const bootstrapRevision =
      this.buildWorkspaceBootstrapRevision({
        accountId,
        membershipId:
          membership.id,
        role,
        schoolId,
        branchId,
        records,
        platformRecords:
          platformCache.records,
      });

    return {
      ok: true,
      accountId,
      membershipId:
        membership.id,
      role,
      schoolId,
      branchId,
      teacherLocalId,
      studentLocalId,
      parentLocalId,
      workspace,

      // Explicit fields for the first-entry appearance handoff. Keep workspace
      // for backward compatibility with existing clients.
      school: workspace.school,
      branch: workspace.branch,
      schoolBranchSettings:
        workspace.settings,
      requiredTables: tables,
      completed: true,

      records,
      cacheRecords:
        platformCache.records,
      quarantineRecords,
      changedTables:
        [...changedTables],

      // The frontend stores these values in the scoped readiness marker.
      // An old or partial marker is never accepted as a complete workspace.
      bootstrapSchemaVersion:
        WORKSPACE_BOOTSTRAP_SCHEMA_VERSION,
      includedTables:
        tables,
      tablesWithRecords:
        Object.keys(tableCounts),

      bootstrapRevision,
      revision: bootstrapRevision,
      serverTime:
        Date.now(),
      recordCount:
        records.length,
      totalRecords:
        records.length + platformCache.records.length,
      tableCounts,
      quarantinedCount:
        quarantineRecords.length,
      truncated: false,
    };
  }

  async bootstrap(user: { id?: string; accountId?: string; email?: string; role?: string }, dto?: PlatformCacheDto) {
    const accountId = this.cleanId(dto?.accountId || user.accountId);
    if (!accountId) throw new BadRequestException("Account session is missing.");

    await this.ensureAccount(accountId);
    await this.touchDevice({ accountId, userId: user.id, deviceId: dto?.deviceId, lastSeenAt: new Date() });

    const [platformCache, syncStatus] = await Promise.all([
      this.platformCache(user as AuthUser, { accountId, deviceId: dto?.deviceId, since: dto?.since }),
      this.diagnostics(user as AuthUser, accountId),
    ]);

    return {
      ok: true,
      accountId,
      serverTime: Date.now(),
      platformCache,
      syncStatus,
    };
  }

  async platformCache(actor: AuthUser, dto: PlatformCacheDto) {
    const accountId = this.requireActorAccount(actor, dto.accountId);
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
      storageUsages,
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
    add("storageUsages", storageUsages);
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

  async listConflicts(actor: AuthUser, status = "open") {
    const cleanAccountId = this.requireActorAccount(actor);
    if (!cleanAccountId) throw new BadRequestException("accountId is required.");

    const conflicts = await this.prisma.syncConflict.findMany({
      where: { accountId: cleanAccountId, ...(status ? { status } : {}) },
      orderBy: { detectedAt: "desc" },
      take: 200,
    });

    return { conflicts: conflicts.map((c) => this.toPlain(c)), serverTime: Date.now() };
  }

  async resolveConflict(actor: AuthUser, conflictId: string, dto: ResolveSyncConflictDto) {
    const accountId = this.requireActorAccount(actor);
    const userId = actor.id;
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

  async diagnostics(actor: AuthUser, requestedAccountId?: string) {
    const actorAccountId = this.requireActorAccount(actor);
    const normalizedRole = String(actor.role || "").toLowerCase();
    const mayCrossAccounts = ["developer", "platform_team"].includes(normalizedRole);
    const accountId = mayCrossAccounts
      ? this.cleanId(requestedAccountId) || actorAccountId
      : actorAccountId;
    const where = { accountId };

    const [total, deleted, conflicts, devices, tables] = await Promise.all([
      this.prisma.syncRecord.count({ where }),
      this.prisma.syncRecord.count({ where: { ...where, isDeleted: true } }),
      this.prisma.syncConflict.count({ where: { accountId, status: "open" } }),
      this.prisma.syncDevice.count({ where: { accountId, active: true } }),
      this.prisma.syncRecord.groupBy({
        by: ["tableName"],
        where,
        _count: { tableName: true },
        orderBy: { _count: { tableName: "desc" } },
      }),
    ]);

    return { total, deleted, conflicts, devices, tables };
  }

  private requireActorAccount(
    actor: AuthUser,
    suppliedAccountId?: string | null,
  ) {
    const jwtAccountId = this.cleanId(actor?.accountId);
    const requestAccountId = this.cleanId(suppliedAccountId);

    if (!jwtAccountId) {
      throw new ForbiddenException(
        "The authenticated session has no accountId.",
      );
    }

    if (
      requestAccountId &&
      requestAccountId !== jwtAccountId
    ) {
      throw new ForbiddenException(
        "The request accountId does not match the authenticated JWT accountId.",
      );
    }

    return jwtAccountId;
  }

  private async actorTenantScope(actor: AuthUser) {
    const accountId = this.requireActorAccount(actor);
    const userId = this.cleanString(actor?.id);
    const role = String(actor?.role || "").trim().toLowerCase();

    if (!userId) {
      throw new ForbiddenException(
        "The authenticated session has no user id.",
      );
    }

    const memberships =
      await this.prisma.userMembership.findMany({
        where: {
          accountId,
          userId,
          active: true,
        },
        select: {
          role: true,
          schoolId: true,
          branchId: true,
          active: true,
        },
      });

    if (!memberships.length) {
      throw new ForbiddenException(
        "No active membership grants access to this account.",
      );
    }

    const roles = new Set([
      role,
      ...memberships.map((membership) =>
        String(membership.role || "").toLowerCase(),
      ),
    ]);

    const accountWide =
      roles.has("developer") ||
      roles.has("platform_team") ||
      roles.has("super_admin") ||
      memberships.some(
        (membership) =>
          ["super_admin", "admin"].includes(
            String(membership.role || "").toLowerCase(),
          ) &&
          !membership.schoolId &&
          !membership.branchId,
      );

    const schoolIds = new Set<number>();
    const branchIds = new Set<number>();

    for (const membership of memberships) {
      const schoolId = this.cleanNumber(membership.schoolId);
      const branchId = this.cleanNumber(membership.branchId);
      if (schoolId) schoolIds.add(schoolId);
      if (branchId) branchIds.add(branchId);
    }

    return {
      accountId,
      accountWide,
      schoolIds,
      branchIds,
    };
  }

  private tenantIdsForRecord(
    tableName: string,
    payload: Record<string, any>,
    localId?: number,
  ) {
    const schoolId = this.cleanNumber(
      payload.schoolId ||
        (tableName === "schools" ? payload.id || localId : undefined),
    );

    const branchId = this.cleanNumber(
      payload.branchId ||
        (tableName === "branches" ? payload.id || localId : undefined),
    );

    return { schoolId, branchId };
  }

  private async assertActorTenantAccess(
    actor: AuthUser,
    tableName: string,
    payload: Record<string, any>,
    localId?: number,
  ) {
    const scope = await this.actorTenantScope(actor);

    if (scope.accountWide) return;

    const { schoolId, branchId } =
      this.tenantIdsForRecord(tableName, payload, localId);

    if (branchId) {
      if (!scope.branchIds.has(branchId)) {
        throw new ForbiddenException(
          `${tableName} belongs to a branch outside the authenticated user's membership scope.`,
        );
      }

      if (schoolId && !scope.schoolIds.has(schoolId)) {
        throw new ForbiddenException(
          `${tableName} belongs to a school outside the authenticated user's membership scope.`,
        );
      }

      return;
    }

    if (schoolId) {
      if (!scope.schoolIds.has(schoolId)) {
        throw new ForbiddenException(
          `${tableName} belongs to a school outside the authenticated user's membership scope.`,
        );
      }

      return;
    }

    // Account-level records are visible to any active account membership.
  }


  private appearanceScopeForWorkspaceRole(
    role: WorkspaceBootstrapRole,
  ): "platform" | "account" | "school" | "branch" {
    if (["developer", "platform_team"].includes(role)) {
      return "platform";
    }

    if (role === "super_admin") {
      return "account";
    }

    if (["admin", "school_admin"].includes(role)) {
      return "school";
    }

    return "branch";
  }

  private normalizeWorkspaceRole(
    value?: string | null,
  ): WorkspaceBootstrapRole {
    const role =
      String(value || "")
        .trim()
        .toLowerCase()
        .replace(/-/g, "_");

    const aliases:
      Record<
        string,
        WorkspaceBootstrapRole
      > = {
      owner: "super_admin",
      school_owner:
        "super_admin",
      schooladmin:
        "school_admin",
      branchadmin:
        "branch_admin",
    };

    const normalized =
      aliases[role] ||
      role;

    if (
      !Object.prototype.hasOwnProperty.call(
        WORKSPACE_BOOTSTRAP_TABLES,
        normalized,
      )
    ) {
      throw new BadRequestException(
        `Unsupported workspace role: ${role || "missing role"}.`,
      );
    }

    return normalized as WorkspaceBootstrapRole;
  }

  private async resolveWorkspaceMembership(
    actor: AuthUser,
    dto: WorkspaceBootstrapDto,
  ) {
    const accountId =
      this.requireActorAccount(
        actor,
        dto.accountId,
      );

    const requestedRole =
      dto.role
        ? this.normalizeWorkspaceRole(
            dto.role,
          )
        : undefined;

    const membership =
      await this.prisma.userMembership.findFirst({
        where: {
          accountId,
          userId: actor.id,
          active: true,
          ...(dto.membershipId
            ? {
                id:
                  dto.membershipId,
              }
            : {}),
          ...(requestedRole
            ? {
                role: {
                  in:
                    this.membershipRoleCandidates(
                      requestedRole,
                    ),
                },
              }
            : {}),
        },
        orderBy: {
          createdAt: "asc",
        },
      });

    if (!membership) {
      throw new ForbiddenException(
        "The selected role membership is not active for this account.",
      );
    }

    const requestedSchoolId =
      this.cleanNumber(
        dto.schoolId,
      );

    const requestedBranchId =
      this.cleanNumber(
        dto.branchId,
      );

    if (
      membership.schoolId &&
      requestedSchoolId &&
      Number(
        membership.schoolId,
      ) !== requestedSchoolId
    ) {
      throw new ForbiddenException(
        "The selected school is outside this membership.",
      );
    }

    if (
      membership.branchId &&
      requestedBranchId &&
      Number(
        membership.branchId,
      ) !== requestedBranchId
    ) {
      throw new ForbiddenException(
        "The selected branch is outside this membership.",
      );
    }

    return membership;
  }

  private membershipRoleCandidates(
    role: WorkspaceBootstrapRole,
  ) {
    if (role === "school_admin") {
      return [
        "school_admin",
        "admin",
      ];
    }

    if (role === "super_admin") {
      return [
        "super_admin",
        "owner",
      ];
    }

    return [role];
  }

  private async assertWorkspaceScope(
    input: {
      actor: AuthUser;
      role:
        WorkspaceBootstrapRole;
      schoolId?: number;
      branchId?: number;
      teacherLocalId?: number;
      studentLocalId?: number;
      parentLocalId?: number;
    },
  ) {
    const {
      actor,
      role,
      schoolId,
      branchId,
      teacherLocalId,
      studentLocalId,
      parentLocalId,
    } = input;

    if (
      [
        "branch_admin",
        "teacher",
        "student",
        "parent",
        "accountant",
      ].includes(role) &&
      !branchId
    ) {
      throw new BadRequestException(
        `${role} workspace bootstrap requires branchId.`,
      );
    }

    if (
      ![
        "developer",
        "platform_team",
      ].includes(role) &&
      !schoolId
    ) {
      throw new BadRequestException(
        `${role} workspace bootstrap requires schoolId.`,
      );
    }

    if (
      role === "teacher" &&
      !teacherLocalId
    ) {
      throw new BadRequestException(
        "Teacher workspace bootstrap requires teacherLocalId.",
      );
    }

    if (
      role === "student" &&
      !studentLocalId
    ) {
      throw new BadRequestException(
        "Student workspace bootstrap requires studentLocalId.",
      );
    }

    if (
      role === "parent" &&
      !parentLocalId
    ) {
      throw new BadRequestException(
        "Parent workspace bootstrap requires parentLocalId.",
      );
    }

    await this.assertActorTenantAccess(
      actor,
      branchId
        ? "schoolBranchSettings"
        : "academicPeriods",
      {
        schoolId,
        branchId,
      },
    );
  }

  private workspaceBootstrapTables(
    role: WorkspaceBootstrapRole,
    requested?: string[],
  ) {
    const allowed =
      new Set(
        WORKSPACE_BOOTSTRAP_TABLES[
          role
        ],
      );

    if (
      !requested ||
      !requested.length
    ) {
      return [...allowed];
    }

    const filtered =
      requested
        .map((table) =>
          this.cleanTableName(
            table,
          ),
        )
        .filter(
          (
            table,
          ): table is string =>
            Boolean(
              table &&
              allowed.has(
                table,
              ) &&
              LOCAL_FIRST_TABLES.has(
                table,
              ),
            ),
        );

    return filtered.length
      ? [...new Set(filtered)]
      : [...allowed];
  }

  private filterWorkspaceBootstrapRecords(
    records: any[],
    scope: {
      role:
        WorkspaceBootstrapRole;
      schoolId?: number;
      branchId?: number;
      teacherLocalId?: number;
      studentLocalId?: number;
      parentLocalId?: number;
    },
  ) {
    const childStudentIds =
      new Set<number>();

    if (
      scope.role === "parent" &&
      scope.parentLocalId
    ) {
      for (const record of records) {
        if (
          record.tableName !==
          "studentParents"
        ) {
          continue;
        }

        const payload =
          (record.payload || {}) as Record<
            string,
            any
          >;

        if (
          this.cleanNumber(
            payload.parentLocalId ||
              payload.parentId,
          ) ===
          scope.parentLocalId
        ) {
          const studentId =
            this.cleanNumber(
              payload.studentLocalId ||
                payload.studentId,
            );

          if (studentId) {
            childStudentIds.add(
              studentId,
            );
          }
        }
      }
    }

    const tenantScopedRecords = records.filter((record) =>
      record.tableName !== "mediaAssets" &&
      this.recordMatchesWorkspaceTenant(
        record,
        scope.schoolId,
        scope.branchId,
      ),
    );

    const allowedOwnerIds = new Map<string, Set<number>>();

    for (const record of tenantScopedRecords) {
      const localId = this.cleanNumber(
        record.payload?.id || record.localId,
      );

      if (!localId) continue;

      const ids = allowedOwnerIds.get(record.tableName) || new Set<number>();
      ids.add(localId);
      allowedOwnerIds.set(record.tableName, ids);
    }

    return records.filter(
      (record) => {
        const payload =
          (record.payload || {}) as Record<
            string,
            any
          >;

        if (
          record.isDeleted &&
          !payload.isDeleted
        ) {
          payload.isDeleted =
            true;
        }

        if (record.tableName === "mediaAssets") {
          const mediaSchoolId = this.cleanNumber(payload.schoolId);
          const mediaBranchId = this.cleanNumber(payload.branchId);

          if (scope.schoolId && mediaSchoolId && mediaSchoolId !== scope.schoolId) {
            return false;
          }

          if (scope.branchId && mediaBranchId && mediaBranchId !== scope.branchId) {
            return false;
          }

          const ownerTable = this.cleanString(payload.ownerTable);
          const ownerLocalId = this.cleanNumber(payload.ownerLocalId);

          if (ownerTable && ownerLocalId) {
            return Boolean(allowedOwnerIds.get(ownerTable)?.has(ownerLocalId));
          }

          return Boolean(
            (!scope.schoolId || mediaSchoolId === scope.schoolId) &&
            (!scope.branchId || mediaBranchId === scope.branchId),
          );
        }

        if (
          !this.recordMatchesWorkspaceTenant(
            record,
            scope.schoolId,
            scope.branchId,
          )
        ) {
          return false;
        }

        if (
          scope.role ===
            "student" &&
          scope.studentLocalId
        ) {
          return this.recordMatchesStudentWorkspace(
            record,
            scope.studentLocalId,
          );
        }

        if (
          scope.role ===
            "parent" &&
          scope.parentLocalId
        ) {
          return this.recordMatchesParentWorkspace(
            record,
            scope.parentLocalId,
            childStudentIds,
          );
        }

        if (
          scope.role ===
            "teacher" &&
          scope.teacherLocalId
        ) {
          return this.recordMatchesTeacherWorkspace(
            record,
            scope.teacherLocalId,
          );
        }

        return true;
      },
    );
  }

  private recordMatchesWorkspaceTenant(
    record: any,
    schoolId?: number,
    branchId?: number,
  ) {
    const payload =
      (record.payload || {}) as Record<
        string,
        any
      >;

    const recordSchoolId =
      this.cleanNumber(
        payload.schoolId ||
          (
            record.tableName ===
            "schools"
              ? payload.id ||
                record.localId
              : undefined
          ),
      );

    const recordBranchId =
      this.cleanNumber(
        payload.branchId ||
          (
            record.tableName ===
            "branches"
              ? payload.id ||
                record.localId
              : undefined
          ),
      );

    if (
      schoolId &&
      recordSchoolId &&
      recordSchoolId !==
        schoolId
    ) {
      return false;
    }

    if (
      branchId &&
      recordBranchId &&
      recordBranchId !==
        branchId
    ) {
      return false;
    }

    if (
      BRANCH_REQUIRED_TABLES.has(
        record.tableName,
      ) &&
      branchId &&
      recordBranchId !==
        branchId
    ) {
      return false;
    }

    if (
      SCHOOL_REQUIRED_TABLES.has(
        record.tableName,
      ) &&
      schoolId &&
      recordSchoolId !==
        schoolId
    ) {
      return false;
    }

    return true;
  }

  private recordMatchesStudentWorkspace(
    record: any,
    studentLocalId: number,
  ) {
    const sharedTables =
      new Set([
        "schools",
        "branches",
        "schoolBranchSettings",
        "academicPeriods",
        "classes",
        "subjects",
        "classSubjects",
        "announcements",
      ]);

    if (
      sharedTables.has(
        record.tableName,
      )
    ) {
      return true;
    }

    const payload =
      (record.payload || {}) as Record<
        string,
        any
      >;

    return (
      this.cleanNumber(
        payload.studentLocalId ||
          payload.studentId ||
          (
            record.tableName ===
            "students"
              ? payload.id ||
                record.localId
              : undefined
          ),
      ) === studentLocalId
    );
  }

  private recordMatchesParentWorkspace(
    record: any,
    parentLocalId: number,
    childStudentIds:
      Set<number>,
  ) {
    const sharedTables =
      new Set([
        "schools",
        "branches",
        "schoolBranchSettings",
        "academicPeriods",
        "classes",
        "announcements",
      ]);

    if (
      sharedTables.has(
        record.tableName,
      )
    ) {
      return true;
    }

    const payload =
      (record.payload || {}) as Record<
        string,
        any
      >;

    const recordParentId =
      this.cleanNumber(
        payload.parentLocalId ||
          payload.parentId ||
          (
            record.tableName ===
            "parents"
              ? payload.id ||
                record.localId
              : undefined
          ),
      );

    if (
      recordParentId ===
      parentLocalId
    ) {
      return true;
    }

    const studentId =
      this.cleanNumber(
        payload.studentLocalId ||
          payload.studentId ||
          (
            record.tableName ===
            "students"
              ? payload.id ||
                record.localId
              : undefined
          ),
      );

    return Boolean(
      studentId &&
      childStudentIds.has(
        studentId,
      ),
    );
  }

  private recordMatchesTeacherWorkspace(
    record: any,
    teacherLocalId: number,
  ) {
    const sharedTables =
      new Set([
        "schools",
        "branches",
        "schoolBranchSettings",
        "academicPeriods",
        "classes",
        "subjects",
        "classSubjects",
        "students",
        "studentEnrollments",
        "assessmentStructures",
        "assessmentStructureItems",
        "assessmentApplicabilities",
      ]);

    if (
      sharedTables.has(
        record.tableName,
      )
    ) {
      return true;
    }

    const payload =
      (record.payload || {}) as Record<
        string,
        any
      >;

    return (
      this.cleanNumber(
        payload.teacherLocalId ||
          payload.teacherId,
      ) === teacherLocalId
    );
  }

  private toBootstrapPullRecord(
    record: any,
  ) {
    return {
      tableName:
        record.tableName,
      localId:
        record.localId,
      cloudId:
        record.id,
      accountId:
        record.accountId,
      deviceId:
        record.deviceId ||
        undefined,
      version:
        record.version,
      updatedAt:
        Number(
          record.updatedAt,
        ),
      isDeleted:
        record.isDeleted,
      payload:
        record.payload,
    };
  }

  private buildWorkspaceSummary(
    records: any[],
    scope: {
      role:
        WorkspaceBootstrapRole;
      schoolId?: number;
      branchId?: number;
      teacherLocalId?: number;
      studentLocalId?: number;
      parentLocalId?: number;
    },
  ) {
    const latest = (
      tableName: string,
      predicate?:
        (
          payload:
            Record<
              string,
              any
            >,
          record: any,
        ) => boolean,
    ) =>
      [...records]
        .reverse()
        .find(
          (record) => {
            if (
              record.tableName !==
              tableName
            ) {
              return false;
            }

            return predicate
              ? predicate(
                  record.payload ||
                    {},
                  record,
                )
              : true;
          },
        )?.payload ||
      null;

    const appearanceScope =
      this.appearanceScopeForWorkspaceRole(
        scope.role,
      );

    const exactBranchSettings =
      appearanceScope === "branch"
        ? latest(
            "schoolBranchSettings",
            (payload) =>
              (!scope.schoolId ||
                this.cleanNumber(payload.schoolId) === scope.schoolId) &&
              (!scope.branchId ||
                this.cleanNumber(payload.branchId) === scope.branchId),
          )
        : null;

    return {
      role:
        scope.role,
      appearanceScope,
      school:
        latest(
          "schools",
          (payload, record) =>
            !scope.schoolId ||
            this.cleanNumber(
              payload.id ||
                record.localId,
            ) ===
              scope.schoolId,
        ),
      branch:
        latest(
          "branches",
          (payload, record) =>
            !scope.branchId ||
            this.cleanNumber(
              payload.id ||
                record.localId,
            ) ===
              scope.branchId,
        ),
      // Branch settings are effective only for branch-scoped memberships.
      // They may still be present in the record bundle for management pages,
      // but they must never become the Owner/Developer/School portal theme.
      settings:
        exactBranchSettings,
      academicPeriod:
        latest(
          "academicPeriods",
          (payload) =>
            payload.active ===
              true ||
            payload.isCurrent ===
              true ||
            payload.current ===
              true,
        ) ||
        latest(
          "academicPeriods",
        ),
    };
  }

  private async lightweightWorkspacePlatformCache(
    actor: AuthUser,
    accountId: string,
  ) {
    const [
      account,
      user,
      memberships,
      permissionRules,
    ] = await Promise.all([
      this.prisma.account.findUnique({
        where: {
          id: accountId,
        },
      }),
      this.prisma.appUser.findUnique({
        where: {
          id: actor.id,
        },
        select: {
          id: true,
          accountId: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          active: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.userMembership.findMany({
        where: {
          accountId,
          userId: actor.id,
          active: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      }),
      this.prisma.permissionRule.findMany({
        where: {
          accountId,
        },
        orderBy: {
          moduleKey: "asc",
        },
      }),
    ]);

    const records: any[] = [];

    const add = (
      tableName: string,
      value: any,
    ) => {
      const rows =
        Array.isArray(value)
          ? value
          : value
            ? [value]
            : [];

      for (const row of rows) {
        const payload =
          this.toPlain(row);

        records.push({
          tableName,
          id:
            payload.id ||
            payload.accountId,
          cloudId:
            payload.id ||
            payload.accountId,
          accountId,
          updatedAt:
            payload.updatedAt ||
            payload.createdAt ||
            Date.now(),
          isDeleted: false,
          payload,
        });
      }
    };

    add(
      "accounts",
      account,
    );
    add(
      "appUsers",
      user,
    );
    add(
      "userMemberships",
      memberships,
    );
    add(
      "permissionRules",
      permissionRules,
    );

    return {
      records,
    };
  }

  private buildWorkspaceBootstrapRevision(
    input: {
      accountId: string;
      membershipId: string;
      role:
        WorkspaceBootstrapRole;
      schoolId?: number;
      branchId?: number;
      records: any[];
      platformRecords: any[];
    },
  ) {
    const signature = [
      input.accountId,
      input.membershipId,
      input.role,
      input.schoolId ||
        "",
      input.branchId ||
        "",
      ...input.records.map(
        (record) =>
          [
            record.cloudId,
            record.version,
            record.updatedAt,
            record.isDeleted
              ? 1
              : 0,
          ].join(":"),
      ),
      ...input.platformRecords.map(
        (record) =>
          [
            record.tableName,
            record.cloudId,
            record.updatedAt,
          ].join(":"),
      ),
    ].join("|");

    /**
     * A compact deterministic revision without adding a database column.
     */
    let hash = 2166136261;

    for (
      let index = 0;
      index <
      signature.length;
      index += 1
    ) {
      hash ^=
        signature.charCodeAt(
          index,
        );

      hash =
        Math.imul(
          hash,
          16777619,
        );
    }

    return (
      "ws-" +
      (hash >>> 0)
        .toString(16)
        .padStart(8, "0")
    );
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

    const basePayload = {
      ...(record.payload || {}),
      accountId,
      cloudId: cloudId || record.payload?.cloudId,
    };

    const payload =
      record.tableName === MEDIA_ASSETS_TABLE
        ? this.normalizeMediaPayload(
            basePayload,
            accountId,
            deviceId,
            Boolean(record.isDeleted),
          )
        : basePayload;

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

    const ownerTable =
      this.cleanString(payload.ownerTable);

    const fieldKey =
      this.cleanString(payload.fieldKey);

    const ownerCloudId =
      this.cleanString(payload.ownerCloudId);

    const ownerTempKey =
      this.cleanString(payload.ownerTempKey);

    const ownerLocalId =
      this.cleanNumber(payload.ownerLocalId);

    const deviceId =
      this.cleanString(
        payload.deviceId ||
          args.deviceId,
      );

    const ownerIdentityKey =
      this.cleanString(
        payload.ownerIdentityKey,
      ) ||
      this.buildMediaIdentityKey({
        accountId: args.accountId,
        ownerTable,
        fieldKey,
        ownerCloudId,
        ownerTempKey,
        ownerLocalId,
        deviceId,
      });

    /**
     * Fast exact lookup for Phase 16 records.
     *
     * ownerIdentityKey already includes:
     * accountId + ownerTable + fieldKey + strongest owner identity.
     */
    if (ownerIdentityKey) {
      const candidates =
        await this.prisma.syncRecord.findMany({
          where: {
            accountId: args.accountId,
            tableName: MEDIA_ASSETS_TABLE,
            payload: {
              path: ["ownerIdentityKey"],
              equals: ownerIdentityKey,
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
          take: 20,
        });

      const exact = candidates.find(
        (row: any) => {
          const candidatePayload =
            (row.payload || {}) as Record<
              string,
              any
            >;

          return (
            candidatePayload.ownerIdentityKey ===
              ownerIdentityKey &&
            candidatePayload.ownerTable ===
              ownerTable &&
            candidatePayload.fieldKey ===
              fieldKey
          );
        },
      );

      if (exact) return exact;
    }

    /**
     * Legacy fallback priority:
     * 1. ownerCloudId
     * 2. ownerTempKey
     * 3. ownerLocalId + deviceId
     *
     * fieldKey is always included, so logo/photo/signature/etc. never merge.
     */
    if (
      ownerCloudId &&
      ownerTable &&
      fieldKey
    ) {
      const candidates =
        await this.prisma.syncRecord.findMany({
          where: {
            accountId: args.accountId,
            tableName: MEDIA_ASSETS_TABLE,
            payload: {
              path: ["ownerCloudId"],
              equals: ownerCloudId,
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
          take: 50,
        });

      const exact = candidates.find(
        (row: any) => {
          const candidatePayload =
            (row.payload || {}) as Record<
              string,
              any
            >;

          return (
            this.cleanString(
              candidatePayload.ownerCloudId,
            ) === ownerCloudId &&
            this.cleanString(
              candidatePayload.ownerTable,
            ) === ownerTable &&
            this.cleanString(
              candidatePayload.fieldKey,
            ) === fieldKey
          );
        },
      );

      if (exact) return exact;
    }

    if (
      ownerTempKey &&
      ownerTable &&
      fieldKey
    ) {
      const candidates =
        await this.prisma.syncRecord.findMany({
          where: {
            accountId: args.accountId,
            tableName: MEDIA_ASSETS_TABLE,
            payload: {
              path: ["ownerTempKey"],
              equals: ownerTempKey,
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
          take: 50,
        });

      const exact = candidates.find(
        (row: any) => {
          const candidatePayload =
            (row.payload || {}) as Record<
              string,
              any
            >;

          return (
            this.cleanString(
              candidatePayload.ownerTempKey,
            ) === ownerTempKey &&
            this.cleanString(
              candidatePayload.ownerTable,
            ) === ownerTable &&
            this.cleanString(
              candidatePayload.fieldKey,
            ) === fieldKey
          );
        },
      );

      if (exact) return exact;
    }

    if (
      ownerLocalId &&
      deviceId &&
      ownerTable &&
      fieldKey
    ) {
      const candidates =
        await this.prisma.syncRecord.findMany({
          where: {
            accountId: args.accountId,
            tableName: MEDIA_ASSETS_TABLE,
            payload: {
              path: ["ownerLocalId"],
              equals: ownerLocalId,
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
          take: 50,
        });

      const exact = candidates.find(
        (row: any) => {
          const candidatePayload =
            (row.payload || {}) as Record<
              string,
              any
            >;

          const candidateDeviceId =
            this.cleanString(
              candidatePayload.deviceId ||
                row.deviceId,
            );

          return (
            Number(
              candidatePayload.ownerLocalId ||
                0,
            ) === ownerLocalId &&
            candidateDeviceId === deviceId &&
            this.cleanString(
              candidatePayload.ownerTable,
            ) === ownerTable &&
            this.cleanString(
              candidatePayload.fieldKey,
            ) === fieldKey
          );
        },
      );

      if (exact) return exact;
    }

    return null;
  }

  private async afterUpsertRecord(
    saved: any,
    incoming: SyncPushRecordDto,
  ) {
    if (
      incoming.tableName !==
      MEDIA_ASSETS_TABLE
    ) {
      return;
    }

    const originalPayload =
      (saved.payload || {}) as Record<
        string,
        any
      >;

    const normalizedPayload =
      this.normalizeMediaPayload(
        {
          ...originalPayload,
          cloudId: saved.id,
        },
        saved.accountId,
        this.cleanString(
          saved.deviceId ||
            incoming.deviceId,
        ),
        Boolean(
          saved.isDeleted ||
            incoming.isDeleted,
        ),
      );

    const payloadChanged =
      originalPayload.cloudId !==
        saved.id ||
      originalPayload.ownerIdentityKey !==
        normalizedPayload.ownerIdentityKey ||
      Number(
        originalPayload.identityVersion ||
          0,
      ) !== 1 ||
      originalPayload.deviceId !==
        normalizedPayload.deviceId;

    let finalRecord = saved;

    if (payloadChanged) {
      finalRecord =
        await this.prisma.syncRecord.update({
          where: {
            id: saved.id,
          },
          data: {
            cloudId:
              saved.cloudId ||
              saved.id,
            payload:
              normalizedPayload,
          },
        });
    }

    await this.deactivateReplacedMediaAssets(
      finalRecord,
    );
  }

  private async deactivateReplacedMediaAssets(
    activeRecord: any,
  ) {
    const activePayload =
      (activeRecord.payload || {}) as Record<
        string,
        any
      >;

    const accountId =
      activeRecord.accountId;

    if (
      activeRecord.tableName !==
      MEDIA_ASSETS_TABLE
    ) {
      return;
    }

    if (
      activeRecord.isDeleted ||
      activePayload.active === false ||
      activePayload.isDeleted
    ) {
      return;
    }

    const ownerTable =
      this.cleanString(
        activePayload.ownerTable,
      );

    const fieldKey =
      this.cleanString(
        activePayload.fieldKey,
      );

    const ownerCloudId =
      this.cleanString(
        activePayload.ownerCloudId,
      );

    const ownerTempKey =
      this.cleanString(
        activePayload.ownerTempKey,
      );

    const ownerLocalId =
      this.cleanNumber(
        activePayload.ownerLocalId,
      );

    const deviceId =
      this.cleanString(
        activePayload.deviceId ||
          activeRecord.deviceId,
      );

    const activeIdentityKey =
      this.cleanString(
        activePayload.ownerIdentityKey,
      ) ||
      this.buildMediaIdentityKey({
        accountId,
        ownerTable,
        fieldKey,
        ownerCloudId,
        ownerTempKey,
        ownerLocalId,
        deviceId,
      });

    if (
      !ownerTable ||
      !fieldKey ||
      !activeIdentityKey
    ) {
      return;
    }

    const candidates =
      await this.prisma.syncRecord.findMany({
        where: {
          accountId,
          tableName:
            MEDIA_ASSETS_TABLE,
          NOT: {
            id: activeRecord.id,
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 500,
      });

    const now =
      BigInt(Date.now());

    const updates:
      Promise<any>[] = [];

    for (
      const candidate of
      candidates
    ) {
      const payload =
        (candidate.payload || {}) as Record<
          string,
          any
        >;

      if (
        candidate.isDeleted ||
        payload.isDeleted ||
        payload.active === false
      ) {
        continue;
      }

      if (
        this.cleanString(
          payload.ownerTable,
        ) !== ownerTable ||
        this.cleanString(
          payload.fieldKey,
        ) !== fieldKey
      ) {
        continue;
      }

      const candidateIdentityKey =
        this.cleanString(
          payload.ownerIdentityKey,
        ) ||
        this.buildMediaIdentityKey({
          accountId,
          ownerTable:
            this.cleanString(
              payload.ownerTable,
            ),
          fieldKey:
            this.cleanString(
              payload.fieldKey,
            ),
          ownerCloudId:
            this.cleanString(
              payload.ownerCloudId,
            ),
          ownerTempKey:
            this.cleanString(
              payload.ownerTempKey,
            ),
          ownerLocalId:
            this.cleanNumber(
              payload.ownerLocalId,
            ),
          deviceId:
            this.cleanString(
              payload.deviceId ||
                candidate.deviceId,
            ),
        });

      if (
        candidateIdentityKey !==
        activeIdentityKey
      ) {
        continue;
      }

      updates.push(
        this.prisma.syncRecord.update({
          where: {
            id: candidate.id,
          },
          data: {
            isDeleted: true,
            updatedAt: now,
            version:
              Number(
                candidate.version ||
                  1,
              ) + 1,
            payload: {
              ...payload,
              ownerIdentityKey:
                candidateIdentityKey,
              identityVersion: 1,
              active: false,
              isDeleted: true,
              replacedByCloudId:
                activeRecord.id,
              replacedAt:
                Number(now),
            },
          },
        }),
      );
    }

    if (updates.length) {
      await Promise.all(
        updates,
      );
    }
  }

  private async recordConflict(args: { existing: any; incoming: SyncPushRecordDto; reason: string }) {
    try {
      const conflict = await this.prisma.syncConflict.create({
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

      this.realtime.emitConflictCreated({
        accountId: args.existing.accountId,
        tableName: args.existing.tableName,
        sourceDeviceId: args.incoming.deviceId,
        metadata: { conflictId: conflict.id, reason: args.reason },
      });

      return conflict;
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

  /**
   * Resolve a stable compound pull cursor.
   *
   * New clients send cursorUpdatedAt + cursorId together. Older clients may
   * still send only `since`, which is handled separately by pull().
   *
   * Incomplete compound cursors are rejected because accepting only one side
   * could skip records that share the same timestamp.
   */
  private resolvePullCursor(dto: PullSyncDto): SyncPullCursor | null {
    const hasUpdatedAt =
      dto.cursorUpdatedAt !== undefined &&
      dto.cursorUpdatedAt !== null;

    const hasId = Boolean(this.cleanString(dto.cursorId));

    if (hasUpdatedAt !== hasId) {
      throw new BadRequestException(
        "cursorUpdatedAt and cursorId must be supplied together.",
      );
    }

    if (!hasUpdatedAt || !hasId) {
      return null;
    }

    const updatedAt = Number(dto.cursorUpdatedAt);
    const id = this.cleanString(dto.cursorId);

    if (!Number.isFinite(updatedAt) || updatedAt < 0 || !id) {
      throw new BadRequestException("Invalid synchronization cursor.");
    }

    return {
      updatedAt,
      id,
    };
  }

  private async validateIncomingSyncRecord(
    actor: AuthUser,
    record: SyncPushRecordDto,
    activeAccountId: string,
  ) {
    const tableName =
      this.cleanTableName(
        record.tableName,
      );

    const accountId =
      this.cleanId(
        record.accountId,
      );

    if (
      !tableName ||
      BLOCKED_PUSH_TABLES.has(
        tableName,
      ) ||
      !LOCAL_FIRST_TABLES.has(
        tableName,
      )
    ) {
      throw new ForbiddenException(
        `${tableName || "Unknown table"} is not allowed to be pushed from the browser.`,
      );
    }

    if (
      !accountId ||
      accountId !==
        activeAccountId
    ) {
      throw new BadRequestException(
        "The synchronization record accountId does not match the active account.",
      );
    }

    if (
      !Number.isFinite(
        Number(record.localId),
      ) ||
      Number(record.localId) <= 0
    ) {
      throw new BadRequestException(
        `${tableName} has no valid localId.`,
      );
    }

    if (
      !Number.isFinite(
        Number(record.version),
      ) ||
      Number(record.version) <= 0
    ) {
      throw new BadRequestException(
        `${tableName} has an invalid version.`,
      );
    }

    if (
      !this.isValidSyncTimestamp(
        record.updatedAt,
      )
    ) {
      throw new BadRequestException(
        `${tableName} has an invalid updatedAt timestamp.`,
      );
    }

    if (
      !this.isPlainJsonObject(
        record.payload,
      )
    ) {
      throw new BadRequestException(
        `${tableName} payload must be a valid JSON object.`,
      );
    }

    const payloadAccountId =
      this.cleanId(
        record.payload.accountId,
      );

    if (
      payloadAccountId !==
        activeAccountId
    ) {
      throw new BadRequestException(
        `${tableName} payload belongs to another account.`,
      );
    }

    this.validateTenantFields(
      tableName,
      record.payload,
    );

    await this.assertActorTenantAccess(
      actor,
      tableName,
      record.payload,
      record.localId,
    );
  }

  private async validateStoredPullRecord(
    actor: AuthUser,
    record: any,
    activeAccountId: string,
  ): Promise<{
    ok: boolean;
    reason?: string;
  }> {
    const reasons: string[] = [];

    const tableName =
      this.cleanTableName(
        record?.tableName,
      );

    if (
      !tableName ||
      !LOCAL_FIRST_TABLES.has(
        tableName,
      )
    ) {
      reasons.push(
        "TABLE_NOT_PULLABLE",
      );
    }

    if (
      this.cleanId(
        record?.accountId,
      ) !== activeAccountId
    ) {
      reasons.push(
        "ACCOUNT_MISMATCH",
      );
    }

    if (
      !Number.isFinite(
        Number(record?.localId),
      ) ||
      Number(record?.localId) <= 0
    ) {
      reasons.push(
        "INVALID_LOCAL_ID",
      );
    }

    if (
      !Number.isFinite(
        Number(record?.version),
      ) ||
      Number(record?.version) <= 0
    ) {
      reasons.push(
        "INVALID_VERSION",
      );
    }

    if (
      !this.isValidSyncTimestamp(
        record?.updatedAt,
      )
    ) {
      reasons.push(
        "INVALID_TIMESTAMP",
      );
    }

    if (
      !this.isPlainJsonObject(
        record?.payload,
      )
    ) {
      reasons.push(
        "INVALID_JSON_PAYLOAD",
      );
    } else {
      if (
        this.cleanId(
          record.payload.accountId,
        ) !== activeAccountId
      ) {
        reasons.push(
          "PAYLOAD_ACCOUNT_MISMATCH",
        );
      }

      if (tableName) {
        try {
          this.validateTenantFields(
            tableName,
            record.payload,
          );

          await this.assertActorTenantAccess(
            actor,
            tableName,
            record.payload,
            record.localId,
          );
        } catch (error: any) {
          reasons.push(
            error?.message ||
              "INVALID_TENANT_FIELDS",
          );
        }
      }
    }

    return {
      ok:
        reasons.length === 0,
      reason:
        reasons.join(" | ") ||
        undefined,
    };
  }

  private validateTenantFields(
    tableName: string,
    payload: Record<string, any>,
  ) {
    const requiresSchool =
      SCHOOL_REQUIRED_TABLES.has(
        tableName,
      ) ||
      BRANCH_REQUIRED_TABLES.has(
        tableName,
      );

    if (
      requiresSchool &&
      !this.cleanNumber(
        payload.schoolId,
      )
    ) {
      throw new BadRequestException(
        `${tableName} requires a valid schoolId.`,
      );
    }

    if (
      BRANCH_REQUIRED_TABLES.has(
        tableName,
      ) &&
      !this.cleanNumber(
        payload.branchId,
      )
    ) {
      throw new BadRequestException(
        `${tableName} requires a valid branchId.`,
      );
    }
  }

  private isValidSyncTimestamp(
    value: unknown,
  ) {
    const timestamp =
      Number(value);

    return (
      Number.isFinite(
        timestamp,
      ) &&
      timestamp > 0 &&
      timestamp <=
        Date.now() +
          24 * 60 * 60 * 1000
    );
  }

  private isPlainJsonObject(
    value: unknown,
  ): value is Record<string, any> {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return false;
    }

    const prototype =
      Object.getPrototypeOf(
        value,
      );

    return (
      prototype ===
        Object.prototype ||
      prototype === null
    );
  }

  private normalizeMediaPayload(
    payload: Record<string, any>,
    accountId: string,
    recordDeviceId?: string,
    isDeleted = false,
  ) {
    const ownerTable =
      this.cleanString(payload.ownerTable);

    const fieldKey =
      this.cleanString(payload.fieldKey);

    const ownerCloudId =
      this.cleanString(payload.ownerCloudId);

    const ownerTempKey =
      this.cleanString(payload.ownerTempKey);

    const ownerLocalId =
      this.cleanNumber(payload.ownerLocalId);

    const deviceId =
      this.cleanString(
        payload.deviceId ||
          recordDeviceId,
      );

    const ownerIdentityKey =
      this.buildMediaIdentityKey({
        accountId,
        ownerTable,
        fieldKey,
        ownerCloudId,
        ownerTempKey,
        ownerLocalId,
        deviceId,
      });

    const active =
      payload.active !== false &&
      payload.isDeleted !== true &&
      !isDeleted;

    /**
     * Active media without exact owner identity is unsafe because it could be
     * attached to the wrong owner/field on another device.
     *
     * Deleted tombstones are allowed through so old records can still be
     * deactivated remotely.
     */
    if (
      active &&
      (
        !ownerTable ||
        !fieldKey ||
        !ownerIdentityKey
      )
    ) {
      throw new BadRequestException(
        "Active mediaAssets require accountId, ownerTable, fieldKey, and ownerCloudId, ownerTempKey, or ownerLocalId with deviceId.",
      );
    }

    return {
      ...payload,
      accountId,
      ownerTable,
      fieldKey,
      ownerCloudId,
      ownerTempKey,
      ownerLocalId,
      deviceId,
      ownerIdentityKey,
      identityVersion: 1,
    };
  }

  private buildMediaIdentityKey(input: {
    accountId?: string;
    ownerTable?: string;
    fieldKey?: string;
    ownerCloudId?: string;
    ownerTempKey?: string;
    ownerLocalId?: number;
    deviceId?: string;
  }) {
    const accountId =
      this.cleanString(
        input.accountId,
      );

    const ownerTable =
      this.cleanString(
        input.ownerTable,
      );

    const fieldKey =
      this.cleanString(
        input.fieldKey,
      );

    if (
      !accountId ||
      !ownerTable ||
      !fieldKey
    ) {
      return undefined;
    }

    const encode = (
      value: string | number,
    ) =>
      encodeURIComponent(
        String(value),
      );

    if (input.ownerCloudId) {
      return [
        encode(accountId),
        encode(ownerTable),
        encode(fieldKey),
        "cloud",
        encode(input.ownerCloudId),
      ].join("|");
    }

    if (input.ownerTempKey) {
      return [
        encode(accountId),
        encode(ownerTable),
        encode(fieldKey),
        "temp",
        encode(input.ownerTempKey),
      ].join("|");
    }

    if (
      input.ownerLocalId &&
      input.deviceId
    ) {
      return [
        encode(accountId),
        encode(ownerTable),
        encode(fieldKey),
        "local",
        encode(input.ownerLocalId),
        encode(input.deviceId),
      ].join("|");
    }

    return undefined;
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
    const source = { ...(payload || {}) };

    delete source.password;
    delete source.passwordHash;
    delete source.refreshToken;
    delete source.refreshTokenHash;
    delete source.keyHash;
    delete source.secret;
    delete source.secretHash;

    if (tableName === MEDIA_ASSETS_TABLE) {
      const safeMediaPayload: Record<string, any> = {};

      for (const key of SAFE_MEDIA_ASSET_FIELDS) {
        if (source[key] !== undefined) {
          safeMediaPayload[key] = this.toPlain(source[key]);
        }
      }

      delete safeMediaPayload.blob;
      delete safeMediaPayload.file;
      delete safeMediaPayload.fileBlob;
      delete safeMediaPayload.originalFile;
      delete safeMediaPayload.optimizedFile;
      delete safeMediaPayload.localBlob;
      delete safeMediaPayload.localBlobData;
      delete safeMediaPayload.localBlobId;
      delete safeMediaPayload.data;
      delete safeMediaPayload.binary;
      delete safeMediaPayload.buffer;
      delete safeMediaPayload.arrayBuffer;
      delete safeMediaPayload.objectUrl;
      delete safeMediaPayload.localObjectUrl;
      delete safeMediaPayload.localPreviewUrl;
      delete safeMediaPayload.previewUrl;

      for (const key of [
        "remoteUrl",
        "publicUrl",
        "thumbnailDataUrl",
        "previewDataUrl",
      ]) {
        const value =
          safeMediaPayload[key];

        if (
          typeof value === "string" &&
          value.startsWith("blob:")
        ) {
          delete safeMediaPayload[key];
        }
      }

      return safeMediaPayload;
    }

    delete source.blob;
    delete source.file;
    delete source.fileBlob;
    delete source.originalFile;
    delete source.optimizedFile;
    delete source.localBlob;
    delete source.localBlobData;
    delete source.localBlobId;
    delete source.data;
    delete source.binary;
    delete source.buffer;
    delete source.arrayBuffer;
    delete source.objectUrl;
    delete source.localObjectUrl;
    delete source.localPreviewUrl;
    delete source.previewUrl;
    delete source.base64;
    delete source.thumbnailBase64;
    delete source.previewDataUrl;
    delete source.thumbnailDataUrl;

    return this.removeInlineMediaStrings(source);
  }

  private removeInlineMediaStrings(value: any): any {
    if (value === null || value === undefined) return value;

    if (typeof value === "string") {
      if (
        value.startsWith("data:image/") ||
        value.startsWith("data:application/") ||
        value.startsWith("blob:")
      ) {
        return "";
      }

      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.removeInlineMediaStrings(item));
    }

    if (value instanceof Date) return value.toISOString();
    if (typeof value === "bigint") return Number(value);

    if (typeof value === "object") {
      const cleaned: Record<string, any> = {};
      for (const [key, item] of Object.entries(value)) {
        if (item !== undefined) cleaned[key] = this.removeInlineMediaStrings(item);
      }
      return cleaned;
    }

    return value;
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