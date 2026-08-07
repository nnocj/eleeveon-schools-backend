import type {
  EntitlementFeatureKey,
  EntitlementResourceKey,
} from "./entitlement.types";

export const REQUIRE_FEATURE_KEY =
  "eleeveon:required-feature";

export const REQUIRE_RESOURCE_KEY =
  "eleeveon:required-resource";

export const DEFAULT_FEATURES: Record<
  EntitlementFeatureKey,
  boolean
> = {
  offlineSync: true,
  cloudBackup: false,
  reports: false,
  finance: false,
  attendance: false,
  identityCards: false,
  identitySafety: false,
  transport: false,
  communications: false,
  calendarScheduling: false,
  schoolWebsites: false,
  parentPortal: false,
  studentPortal: false,
  teacherPortal: false,
  advancedAnalytics: false,
  advancedScheduling: false,
  apiAccess: false,
  webhooks: false,
  prioritySupport: false,
};

export const RESOURCE_TO_USAGE_FIELD: Record<
  string,
  keyof import("./entitlement.types").EntitlementUsage
> = {
  schools: "schools",
  branches: "branches",
  users: "users",
  students: "students",
  teachers: "teachers",
  storageMb: "storageMb",
  apiCallsPerMonth: "apiCallsPerMonth",
  devices: "devices",
  activations: "activations",
};

export const RESOURCE_TO_LIMIT_FIELD: Record<
  EntitlementResourceKey,
  string
> = {
  schools: "schools",
  branches: "branches",
  users: "users",
  students: "students",
  teachers: "teachers",
  storageMb: "storageMb",
  apiCallsPerMonth: "apiCallsPerMonth",
  devices: "devices",
  activations: "activations",
};
