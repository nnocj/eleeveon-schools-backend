import {
  Injectable,
  Logger,
} from "@nestjs/common";

export type RealtimeEventType =
  | "ACCOUNT_DATA_CHANGED"
  | "MEMBERSHIPS_CHANGED"
  | "PERMISSIONS_CHANGED"
  | "BRANCH_SETTINGS_CHANGED"
  | "ANNOUNCEMENT_CREATED"
  | "MESSAGE_CREATED"
  | "SYNC_CONFLICT_CREATED"
  | "APP_MAINTENANCE_CHANGED";

export type MembershipChangeAction =
  | "created"
  | "updated"
  | "activated"
  | "deactivated"
  | "deleted";

export type RealtimeInvalidationEvent = {
  type: RealtimeEventType;
  accountId: string;
  changedTables: string[];
  sourceDeviceId?: string;
  revision: number;
  at: number;
  schoolId?: number | null;
  branchId?: number | null;

  /**
   * First-class identity fields allow the frontend to decide whether a
   * MEMBERSHIPS_CHANGED event affects the currently authenticated user.
   */
  userId?: string;
  membershipId?: string;
  action?: MembershipChangeAction;
  active?: boolean;

  metadata?: Record<string, unknown>;
};

type RealtimeEmitter = (
  event: RealtimeInvalidationEvent,
) => void;

@Injectable()
export class RealtimeEventsService {
  private readonly logger =
    new Logger(
      RealtimeEventsService.name,
    );

  private emitter:
    | RealtimeEmitter
    | null = null;

  private lastRevision = 0;

  bindEmitter(
    emitter: RealtimeEmitter,
  ) {
    this.emitter = emitter;
  }

  unbindEmitter() {
    this.emitter = null;
  }

  emitAccountDataChanged(input: {
    accountId: string;
    changedTables:
      readonly string[];
    sourceDeviceId?: string | null;
    schoolId?: number | null;
    branchId?: number | null;
    metadata?: Record<string, unknown>;
  }) {
    return this.emit({
      type:
        "ACCOUNT_DATA_CHANGED",
      ...input,
    });
  }

  emitMembershipsChanged(input: {
    accountId: string;
    userId: string;
    membershipId?: string | null;
    action: MembershipChangeAction;
    active?: boolean;
    sourceDeviceId?: string | null;
    schoolId?: number | null;
    branchId?: number | null;
    metadata?: Record<string, unknown>;
  }) {
    return this.emit({
      type:
        "MEMBERSHIPS_CHANGED",
      accountId:
        input.accountId,
      changedTables: [
        "userMemberships",
        "appUsers",
      ],
      sourceDeviceId:
        input.sourceDeviceId,
      schoolId:
        input.schoolId,
      branchId:
        input.branchId,
      userId:
        input.userId,
      membershipId:
        input.membershipId ||
        undefined,
      action:
        input.action,
      active:
        input.active,
      metadata: {
        ...input.metadata,
        userId:
          input.userId,
        membershipId:
          input.membershipId ||
          undefined,
        action:
          input.action,
        active:
          input.active,
      },
    });
  }

  emitPermissionsChanged(input: {
    accountId: string;
    sourceDeviceId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    return this.emit({
      type:
        "PERMISSIONS_CHANGED",
      accountId:
        input.accountId,
      changedTables: [
        "permissionRules",
      ],
      sourceDeviceId:
        input.sourceDeviceId,
      metadata:
        input.metadata,
    });
  }

  emitConflictCreated(input: {
    accountId: string;
    tableName: string;
    sourceDeviceId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    return this.emit({
      type:
        "SYNC_CONFLICT_CREATED",
      accountId:
        input.accountId,
      changedTables: [
        "syncConflicts",
        input.tableName,
      ],
      sourceDeviceId:
        input.sourceDeviceId,
      metadata:
        input.metadata,
    });
  }

  emit(input: {
    type: RealtimeEventType;
    accountId: string;
    changedTables:
      readonly string[];
    sourceDeviceId?: string | null;
    schoolId?: number | null;
    branchId?: number | null;
    userId?: string | null;
    membershipId?: string | null;
    action?: MembershipChangeAction;
    active?: boolean;
    metadata?: Record<string, unknown>;
  }): RealtimeInvalidationEvent | null {
    const accountId =
      String(
        input.accountId || "",
      ).trim();

    const changedTables = [
      ...new Set(
        (
          input.changedTables ||
          []
        )
          .map((table) =>
            String(
              table || "",
            ).trim(),
          )
          .filter(Boolean),
      ),
    ].sort();

    if (
      !accountId ||
      changedTables.length === 0
    ) {
      return null;
    }

    this.lastRevision =
      Math.max(
        this.lastRevision + 1,
        Date.now(),
      );

    const event:
      RealtimeInvalidationEvent = {
      type:
        input.type,
      accountId,
      changedTables,
      sourceDeviceId:
        input.sourceDeviceId
          ? String(
              input.sourceDeviceId,
            ).trim()
          : undefined,
      revision:
        this.lastRevision,
      at:
        Date.now(),
      schoolId:
        input.schoolId ??
        undefined,
      branchId:
        input.branchId ??
        undefined,
      userId:
        input.userId
          ? String(
              input.userId,
            ).trim()
          : undefined,
      membershipId:
        input.membershipId
          ? String(
              input.membershipId,
            ).trim()
          : undefined,
      action:
        input.action,
      active:
        input.active,
      metadata:
        input.metadata,
    };

    if (!this.emitter) {
      this.logger.debug(
        `Realtime gateway is not bound; skipped ${event.type} for ${accountId}.`,
      );

      return event;
    }

    this.emitter(event);

    return event;
  }
}