/**
 * src/billing/types/usage.types.ts
 * --------------------------------------------------------------------------
 * Shared version-one account usage and quota contracts.
 */

export const USAGE_SCHEMA_VERSION = 1 as const;

export type MeteredResource =
  | "schools"
  | "branches"
  | "users"
  | "students"
  | "teachers"
  | "storageMb"
  | "apiCallsPerMonth";

export type UsageCalculationSource =
  | "reconcile"
  | "mutation"
  | "sync"
  | "manual";

export type QuotaEventType =
  | "warning"
  | "reached"
  | "blocked"
  | "released"
  | "reconciled";

export type QuotaOperation =
  | "create"
  | "update"
  | "activate"
  | "deactivate"
  | "restore"
  | "delete"
  | "upload"
  | "sync_push"
  | "manual";

export type QuotaEventStatus =
  | "open"
  | "resolved"
  | "ignored";

export interface ResourceLimitMap {
  schools: number | null;
  branches: number | null;
  users: number | null;
  students: number | null;
  teachers: number | null;
  storageMb: number | null;
  apiCallsPerMonth: number | null;
}

export interface ResourceUsageMap {
  schools: number;
  branches: number;
  users: number;
  students: number;
  teachers: number;
  storageMb: number;
  apiCallsPerMonth: number;
}

export interface ResourceRemainingMap {
  schools: number | null;
  branches: number | null;
  users: number | null;
  students: number | null;
  teachers: number | null;
  storageMb: number | null;
  apiCallsPerMonth: number | null;
}

export interface AccountUsage {
  accountId: string;
  usage: ResourceUsageMap;
  storageBytes: bigint;
  calculatedAt: Date;
  calculationSource: UsageCalculationSource;
  entitlementVersion: number;
  schemaVersion: typeof USAGE_SCHEMA_VERSION;
  metadata?: Record<string, unknown> | null;
}

export interface AccountUsageSnapshotRecord {
  id: string;
  accountId: string;

  schools: number;
  branches: number;
  users: number;
  students: number;
  teachers: number;

  storageBytes: bigint;
  storageMb: number;
  apiCallsThisMonth: number;

  entitlementVersion: number;
  schemaVersion: typeof USAGE_SCHEMA_VERSION;

  calculatedAt: Date;
  calculationSource: UsageCalculationSource;
  metadata?: Record<string, unknown> | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface UsageDelta {
  resource: MeteredResource;
  amount: number;
  reason?: string;
}

export interface ResourceUsageCheck {
  accountId: string;
  resource: MeteredResource;
  current: number;
  limit: number | null;
  requestedIncrease: number;
  projected: number;
  remainingBefore: number | null;
  remainingAfter: number | null;
  allowed: boolean;
}

export interface UsageReconciliationResult {
  accountId: string;
  previous?: ResourceUsageMap | null;
  current: ResourceUsageMap;
  changedResources: MeteredResource[];
  calculatedAt: Date;
  entitlementVersion: number;
}

export interface QuotaEventRecord {
  id: string;
  accountId: string;

  resource: MeteredResource;
  eventType: QuotaEventType;
  operation?: QuotaOperation | null;

  tableName?: string | null;
  localId?: string | null;
  cloudId?: string | null;
  deviceId?: string | null;

  currentUsage: number;
  limitValue?: number | null;
  requestedIncrease: number;
  remainingBefore?: number | null;
  remainingAfter?: number | null;

  status: QuotaEventStatus;
  message?: string | null;
  details?: Record<string, unknown> | null;

  entitlementVersion: number;
  schemaVersion: typeof USAGE_SCHEMA_VERSION;

  resolvedAt?: Date | null;
  resolvedByUserId?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface QuotaViolationPayload {
  code: "SUBSCRIPTION_LIMIT_REACHED";
  accountId: string;
  resource: MeteredResource;

  current: number;
  limit: number | null;
  requestedIncrease: number;
  projected: number;
  remaining: number | null;

  operation?: QuotaOperation;
  tableName?: string;
  localId?: string;
  deviceId?: string;

  upgradeRequired: true;
  entitlementVersion: number;
  message: string;
}

export interface UsageCounterDefinition {
  resource: MeteredResource;
  tables: string[];
  countsActiveOnly: boolean;
  countsDeletedRecords: false;
  description: string;
}

export function remainingFor(
  limit: number | null,
  current: number,
): number | null {
  if (limit === null) return null;
  return Math.max(0, limit - current);
}

export function canIncreaseUsage(
  limit: number | null,
  current: number,
  increase = 1,
): boolean {
  if (increase <= 0) return true;
  if (limit === null) return true;
  return current + increase <= limit;
}
