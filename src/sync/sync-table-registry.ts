/**
 * src/sync/sync-table-registry.ts
 * --------------------------------------------------------------------------
 * Canonical backend synchronization registry.
 *
 * Keep table names aligned with app/lib/db/core/registry.ts. This file owns
 * backend transport behaviour; SyncService derives push, pull and bootstrap
 * decisions from these exports instead of maintaining independent lists.
 */

export type WorkspaceBootstrapRole =
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

export const WORKSPACE_BOOTSTRAP_SCHEMA_VERSION = 3 as const;

export const LOCAL_FIRST_SYNC_TABLE_NAMES = [
  "schools", "branches", "academicStructures", "academicPeriods", "organizations",
  "students", "teachers", "parents", "studentParents", "classes", "subjects",
  "programs", "curriculums", "curriculumPathways", "curriculumSubjects",
  "classSubjects", "subjectPrerequisites", "studentCurriculums", "subjectOfferings",
  "assignments", "classTeachers", "studentEnrollments",
  "gradingStructures", "gradeRules", "assessmentStructures", "assessmentStructureItems",
  "assessmentApplicabilities", "assessmentComponents", "assessmentEntries", "computedResults",
  "attendance", "studentAttendanceSummaries", "teacherAttendance", "attendanceSessions",
  "attendanceDevices", "attendanceCredentials", "attendanceCredentialEvents",
  "attendanceCaptureEvents", "attendanceEvidenceAssets",
  "identityCredentials", "identityCredentialDesignSettings", "identityCredentialEvents",
  "identityDevices", "identityAccessPoints", "identityActivityEvents", "identityEvidenceAssets",
  "studentIdentityCards", "pickupAuthorizations", "studentPickupEvents", "visitorProfiles",
  "visitorVisits", "schoolVehicles", "transportRoutes", "transportStops",
  "studentTransportAssignments", "transportJourneys", "transportJourneyEvents",
  "emergencyRollCallSessions", "emergencyRollCallEntries",
  "reportCards", "reportCardItems", "reportCardTemplates", "reportCardTemplateSettings",
  "reportCardTemplateAssignments", "studentReportSnapshots", "studentPromotions",
  "schoolBranchSettings", "currencies", "schoolCurrencySettings", "paymentIntents",
  "paymentTransactions", "paymentRefunds", "paymentSettlements", "withdrawalRequests",
  "schoolPayoutSettings", "studentFeeInvoices", "studentFeeInvoiceItems", "studentFeePayments",
  "staffPayrollProfiles", "payrollRuns", "payrollItems", "staffPaymentRecords",
  "feeStructures", "payments", "incomes", "expenses", "portalHighlights",
  "websiteSettings", "websiteTemplateSettings", "websiteTemplateAssignments", "websitePages",
  "websiteSections", "websiteNavigationItems", "websiteDomains", "websiteDomainAliases",
  "websiteForms", "websiteFormSubmissions", "websiteRevisions", "announcements",
  "announcementRecipients", "messageThreads", "messages", "calendarEvents",
  "calendarEventParticipants", "calendarEventReminders", "calendarEventResponses",
  "communicationLogs", "notificationTemplates",
  "scheduleTimetables", "scheduleSessions", "scheduleResources", "scheduleConflicts",
  "schedulePeriodTemplates", "schedulePeriodTemplateAssignments", "schedulePeriodSlots",
  "scheduleSharedBlocks", "scheduleSharedBlockGroups", "scheduleSharedBlockTeachers",
  "scheduleGroups", "scheduleGroupMembers", "scheduleTeacherAvailability",
  "scheduleTeacherWorkloadRules", "scheduleSubjectRequirements", "scheduleRequirementGroups",
  "scheduleRequirementTeachers", "scheduleResourceRequirements", "scheduleConstraintRules",
  "scheduleSessionGroups", "scheduleSessionTeachers", "scheduleSessionResources",
  "scheduleGenerationRuns", "scheduleDrafts", "scheduleDraftSessions",
  "scheduleDraftSessionGroups", "scheduleDraftSessionTeachers", "scheduleDraftSessionResources",
  "scheduleGenerationIssues", "scheduleGenerationSuggestions", "scheduleSuggestionRequirements",
  "scheduleSuggestionGroups", "scheduleSuggestionTeachers", "scheduleSuggestionResources",
  "schedulePublishEvents", "scheduleVersionSnapshots", "mediaAssets",
  "platformAnnouncementReceipts", "platformFeedback", "platformFeedbackAttachments",
  "platformFeedbackMessages",
] as const;

export const PLATFORM_CACHE_TABLE_NAMES = [
  "accounts", "appUsers", "userMemberships", "permissionRules", "userSessions",
  "commercialPlans", "subscriptionPlans", "accountSubscriptions", "subscriptionPeriods",
  "subscriptionChangeOrders", "privateOffers", "privateOfferAssignments", "pricingOverrides",
  "accountUsageSnapshots", "accountEntitlements", "perpetualLicenses", "licenseActivations",
  "licenseValidationEvents", "licenseUpgradeOffers", "supportedLocales", "accountLocaleSettings",
  "userLocalePreferences", "membershipLocalePreferences", "platformReleases",
  "platformReleaseNotes", "platformAnnouncements", "invoices", "appPayments", "billingEvents",
  "syncDevices", "syncConflicts", "apiClients", "apiKeys", "webhooks", "webhookLogs",
  "integrationMappings", "auditLogs", "backgroundJobs", "storageUsages",
  "accountFeatureFlags", "accountSystemSettings", "notificationDeliveryLogs",
] as const;

export const BACKEND_ONLY_TABLE_NAMES = [
  "paymentProviderEvents", "billingReconciliationEvents", "subscriptionJobs",
  "subscriptionReconciliations", "licenseSecrets", "licenseActivationChallenges",
  "developerPricingAudit", "platformFeedbackAdministration",
  "platformAnnouncementTargetingJobs",
] as const;

export const LOCAL_ONLY_TABLE_NAMES = [
  "migrationJournal", "databaseRecoveryBackups", "syncQuarantine", "migrationLocks",
  "migrationHealthReports", "migrationTasks", "dataRepairLogs", "databaseVersionSnapshots",
  "mediaBlobs",
] as const;

export const LOCAL_FIRST_TABLES = new Set<string>(LOCAL_FIRST_SYNC_TABLE_NAMES);
export const PLATFORM_CACHE_TABLES = new Set<string>(PLATFORM_CACHE_TABLE_NAMES);
export const BLOCKED_PUSH_TABLES = new Set<string>([
  ...PLATFORM_CACHE_TABLE_NAMES,
  ...BACKEND_ONLY_TABLE_NAMES,
  ...LOCAL_ONLY_TABLE_NAMES,
]);

export const SCHOOL_REQUIRED_TABLES = new Set<string>([
  "branches", "academicStructures", "academicPeriods", "programs", "curriculums",
  "curriculumPathways", "curriculumSubjects", "subjectPrerequisites", "gradingStructures",
  "gradeRules", "assessmentStructures", "assessmentStructureItems", "reportCardTemplates",
  "reportCardTemplateSettings", "reportCardTemplateAssignments", "feeStructures",
  "schoolCurrencySettings", "schoolPayoutSettings", "websiteSettings",
  "websiteTemplateSettings", "websiteTemplateAssignments", "websitePages", "websiteSections",
  "websiteNavigationItems", "websiteDomains", "websiteDomainAliases", "websiteForms",
  "websiteFormSubmissions", "websiteRevisions", "schedulePeriodTemplates",
  "schedulePeriodTemplateAssignments", "schedulePeriodSlots", "scheduleSharedBlocks",
  "scheduleSharedBlockGroups", "scheduleSharedBlockTeachers", "scheduleTeacherWorkloadRules",
  "scheduleConstraintRules",
]);

export const BRANCH_REQUIRED_TABLES = new Set<string>([
  "students", "teachers", "parents", "studentParents", "classes", "classSubjects",
  "classTeachers", "studentCurriculums", "subjectOfferings", "assignments",
  "studentEnrollments", "assessmentApplicabilities", "assessmentComponents",
  "assessmentEntries", "computedResults", "attendance", "studentAttendanceSummaries",
  "teacherAttendance", "attendanceSessions", "attendanceDevices", "attendanceCredentials",
  "attendanceCredentialEvents", "attendanceCaptureEvents", "attendanceEvidenceAssets",
  "identityCredentials", "identityCredentialDesignSettings", "identityCredentialEvents",
  "identityDevices", "identityAccessPoints", "identityActivityEvents", "identityEvidenceAssets",
  "studentIdentityCards", "pickupAuthorizations", "studentPickupEvents", "visitorProfiles",
  "visitorVisits", "schoolVehicles", "transportRoutes", "transportStops",
  "studentTransportAssignments", "transportJourneys", "transportJourneyEvents",
  "emergencyRollCallSessions", "emergencyRollCallEntries", "reportCards", "reportCardItems",
  "studentReportSnapshots", "studentPromotions", "payments", "incomes", "expenses",
  "paymentIntents", "paymentTransactions", "paymentRefunds", "paymentSettlements",
  "withdrawalRequests", "studentFeeInvoices", "studentFeeInvoiceItems", "studentFeePayments",
  "staffPayrollProfiles", "payrollRuns", "payrollItems", "staffPaymentRecords",
  "schoolBranchSettings", "scheduleTimetables", "scheduleSessions", "scheduleResources",
  "scheduleConflicts", "scheduleGroups", "scheduleGroupMembers",
  "scheduleTeacherAvailability", "scheduleSubjectRequirements", "scheduleRequirementGroups",
  "scheduleRequirementTeachers", "scheduleResourceRequirements", "scheduleSessionGroups",
  "scheduleSessionTeachers", "scheduleSessionResources", "scheduleGenerationRuns",
  "scheduleDrafts", "scheduleDraftSessions", "scheduleDraftSessionGroups",
  "scheduleDraftSessionTeachers", "scheduleDraftSessionResources", "scheduleGenerationIssues",
  "scheduleGenerationSuggestions", "scheduleSuggestionRequirements", "scheduleSuggestionGroups",
  "scheduleSuggestionTeachers", "scheduleSuggestionResources", "schedulePublishEvents",
  "scheduleVersionSnapshots", "platformAnnouncementReceipts", "platformFeedback",
  "platformFeedbackAttachments", "platformFeedbackMessages",
]);

const WEBSITE_TABLES = [
  "schools", "branches", "schoolBranchSettings", "websiteSettings",
  "websiteTemplateSettings", "websiteTemplateAssignments", "websitePages", "websiteSections",
  "websiteNavigationItems", "websiteDomains", "websiteDomainAliases", "websiteForms",
  "websiteFormSubmissions", "websiteRevisions", "mediaAssets",
] as const;

const TEACHER_TABLES = [
  "schools", "branches", "schoolBranchSettings", "academicPeriods", "classes", "subjects",
  "classSubjects", "classTeachers", "assignments", "students", "studentEnrollments",
  "assessmentStructures", "assessmentStructureItems", "assessmentApplicabilities",
  "assessmentComponents", "assessmentEntries", "computedResults", "teacherAttendance",
  "attendance", "studentAttendanceSummaries", "announcements", "announcementRecipients",
  "messageThreads", "messages", "calendarEvents", "calendarEventParticipants",
  "calendarEventReminders", "calendarEventResponses", "scheduleTimetables", "scheduleSessions",
  "scheduleResources", "scheduleGroups", "scheduleGroupMembers", "scheduleTeacherAvailability",
  "scheduleTeacherWorkloadRules", "scheduleSubjectRequirements", "scheduleRequirementGroups",
  "scheduleRequirementTeachers", "scheduleResourceRequirements", "scheduleSessionGroups",
  "scheduleSessionTeachers", "scheduleSessionResources", "schedulePublishEvents",
  "scheduleVersionSnapshots", "identityCredentials", "identityCredentialDesignSettings",
  "identityCredentialEvents", "identityActivityEvents", "identityDevices", "identityAccessPoints",
  "emergencyRollCallSessions", "emergencyRollCallEntries", "mediaAssets",
  "platformAnnouncementReceipts", "platformFeedback", "platformFeedbackAttachments",
  "platformFeedbackMessages",
] as const;

const STUDENT_TABLES = [
  "schools", "branches", "schoolBranchSettings", "academicPeriods", "students",
  "studentEnrollments", "classes", "subjects", "classSubjects", "assignments",
  "computedResults", "studentAttendanceSummaries", "reportCards", "reportCardItems",
  "announcements", "announcementRecipients", "messageThreads", "messages", "calendarEvents",
  "calendarEventParticipants", "scheduleTimetables", "scheduleSessions", "scheduleResources",
  "scheduleSessionGroups", "schedulePublishEvents", "scheduleVersionSnapshots",
  "identityCredentials", "identityCredentialDesignSettings", "identityCredentialEvents",
  "identityActivityEvents", "studentIdentityCards", "studentTransportAssignments",
  "transportJourneys", "transportJourneyEvents", "schoolVehicles", "transportRoutes",
  "transportStops", "emergencyRollCallSessions", "emergencyRollCallEntries", "mediaAssets",
  "platformAnnouncementReceipts", "platformFeedback", "platformFeedbackAttachments",
  "platformFeedbackMessages",
] as const;

const PARENT_TABLES = [
  "schools", "branches", "schoolBranchSettings", "parents", "studentParents", "students",
  "studentEnrollments", "classes", "subjects", "computedResults", "studentAttendanceSummaries",
  "reportCards", "reportCardItems", "announcements", "announcementRecipients",
  "messageThreads", "messages", "calendarEvents", "calendarEventParticipants",
  "scheduleTimetables", "scheduleSessions", "schedulePublishEvents", "scheduleVersionSnapshots",
  "identityCredentials", "identityCredentialDesignSettings", "identityCredentialEvents",
  "identityActivityEvents", "pickupAuthorizations", "studentPickupEvents",
  "studentTransportAssignments", "transportJourneys", "transportJourneyEvents",
  "schoolVehicles", "transportRoutes", "transportStops", "emergencyRollCallSessions",
  "emergencyRollCallEntries", "mediaAssets", "platformAnnouncementReceipts",
  "platformFeedback", "platformFeedbackAttachments", "platformFeedbackMessages",
] as const;

export const WORKSPACE_BOOTSTRAP_TABLES: Record<WorkspaceBootstrapRole, readonly string[]> = {
  developer: WEBSITE_TABLES,
  platform_team: WEBSITE_TABLES,
  super_admin: LOCAL_FIRST_SYNC_TABLE_NAMES,
  admin: LOCAL_FIRST_SYNC_TABLE_NAMES,
  school_admin: LOCAL_FIRST_SYNC_TABLE_NAMES,
  branch_admin: LOCAL_FIRST_SYNC_TABLE_NAMES,
  accountant: LOCAL_FIRST_SYNC_TABLE_NAMES,
  teacher: TEACHER_TABLES,
  student: STUDENT_TABLES,
  parent: PARENT_TABLES,
};

export function validateSyncTableRegistry(): string[] {
  const groups: Array<[string, readonly string[]]> = [
    ["local_first", LOCAL_FIRST_SYNC_TABLE_NAMES],
    ["platform_cache", PLATFORM_CACHE_TABLE_NAMES],
    ["backend_only", BACKEND_ONLY_TABLE_NAMES],
    ["local_only", LOCAL_ONLY_TABLE_NAMES],
  ];
  const owner = new Map<string, string>();
  const issues: string[] = [];
  for (const [group, names] of groups) {
    for (const name of names) {
      const previous = owner.get(name);
      if (previous) issues.push(`${name} appears in both ${previous} and ${group}.`);
      else owner.set(name, group);
    }
  }
  return issues;
}
