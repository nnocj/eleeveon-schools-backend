/*
  Warnings:

  - A unique constraint covering the columns `[subscriptionId]` on the table `AccountEntitlement` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[perpetualLicenseId]` on the table `AccountEntitlement` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "defaultLocale" TEXT NOT NULL DEFAULT 'en-GH',
ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'Africa/Accra';

-- AlterTable
ALTER TABLE "AccountEntitlement" ADD COLUMN     "deploymentMode" TEXT NOT NULL DEFAULT 'connected',
ADD COLUMN     "entitledVersion" TEXT,
ADD COLUMN     "licenseModel" TEXT NOT NULL DEFAULT 'subscription',
ADD COLUMN     "perpetualLicenseId" TEXT,
ADD COLUMN     "subscriptionId" TEXT,
ADD COLUMN     "syncPolicy" TEXT NOT NULL DEFAULT 'full',
ADD COLUMN     "updatePolicy" TEXT NOT NULL DEFAULT 'continuous';

-- AlterTable
ALTER TABLE "AccountPricingOverride" ADD COLUMN     "deploymentModeOverride" TEXT,
ADD COLUMN     "entitledVersionOverride" TEXT,
ADD COLUMN     "licenseModelOverride" TEXT,
ADD COLUMN     "priceOneTime" INTEGER,
ADD COLUMN     "syncPolicyOverride" TEXT,
ADD COLUMN     "updatePolicyOverride" TEXT,
ALTER COLUMN "schemaVersion" SET DEFAULT 2;

-- AlterTable
ALTER TABLE "AccountQuotaEvent" ALTER COLUMN "schemaVersion" SET DEFAULT 2;

-- AlterTable
ALTER TABLE "AccountSubscription" ADD COLUMN     "deploymentMode" TEXT NOT NULL DEFAULT 'connected',
ADD COLUMN     "syncPolicy" TEXT NOT NULL DEFAULT 'full',
ADD COLUMN     "updatePolicy" TEXT NOT NULL DEFAULT 'continuous',
ALTER COLUMN "schemaVersion" SET DEFAULT 2;

-- AlterTable
ALTER TABLE "AccountUsageSnapshot" ALTER COLUMN "schemaVersion" SET DEFAULT 2;

-- AlterTable
ALTER TABLE "AppPayment" ADD COLUMN     "perpetualLicenseId" TEXT;

-- AlterTable
ALTER TABLE "AppUser" ADD COLUMN     "preferredLocale" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "perpetualLicenseId" TEXT;

-- AlterTable
ALTER TABLE "PrivateOffer" ADD COLUMN     "deploymentModeOverride" TEXT,
ADD COLUMN     "entitledVersionOverride" TEXT,
ADD COLUMN     "licenseModelOverride" TEXT,
ADD COLUMN     "priceOneTime" INTEGER,
ADD COLUMN     "syncPolicyOverride" TEXT,
ADD COLUMN     "updatePolicyOverride" TEXT,
ALTER COLUMN "schemaVersion" SET DEFAULT 2;

-- AlterTable
ALTER TABLE "PrivateOfferAssignment" ALTER COLUMN "schemaVersion" SET DEFAULT 2;

-- AlterTable
ALTER TABLE "SubscriptionChangeOrder" ALTER COLUMN "schemaVersion" SET DEFAULT 2;

-- AlterTable
ALTER TABLE "SubscriptionPeriod" ALTER COLUMN "schemaVersion" SET DEFAULT 2;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "activationLimit" INTEGER,
ADD COLUMN     "deploymentMode" TEXT NOT NULL DEFAULT 'connected',
ADD COLUMN     "deviceLimit" INTEGER,
ADD COLUMN     "licenseModel" TEXT NOT NULL DEFAULT 'subscription',
ADD COLUMN     "licensedMajorVersion" INTEGER,
ADD COLUMN     "maximumAppVersion" TEXT,
ADD COLUMN     "minimumAppVersion" TEXT,
ADD COLUMN     "offlineGraceDays" INTEGER,
ADD COLUMN     "priceOneTime" INTEGER,
ADD COLUMN     "requiresPeriodicValidation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "syncPolicy" TEXT NOT NULL DEFAULT 'full',
ADD COLUMN     "updatePolicy" TEXT NOT NULL DEFAULT 'continuous',
ADD COLUMN     "validationIntervalDays" INTEGER,
ALTER COLUMN "schemaVersion" SET DEFAULT 2;

-- AlterTable
ALTER TABLE "SyncDevice" ADD COLUMN     "appBuild" TEXT,
ADD COLUMN     "appVersion" TEXT,
ADD COLUMN     "syncPolicy" TEXT;

-- AlterTable
ALTER TABLE "UserMembership" ADD COLUMN     "preferredLocale" TEXT;

-- CreateTable
CREATE TABLE "PerpetualLicense" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "licenseKeyHash" TEXT NOT NULL,
    "licenseKeyPrefix" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "purchasedVersion" TEXT NOT NULL,
    "entitledVersion" TEXT NOT NULL,
    "licensedMajorVersion" INTEGER,
    "maxSchools" INTEGER,
    "maxBranches" INTEGER,
    "maxUsers" INTEGER,
    "maxStudents" INTEGER,
    "maxTeachers" INTEGER,
    "deviceLimit" INTEGER,
    "activationLimit" INTEGER,
    "syncPolicy" TEXT NOT NULL DEFAULT 'platform_only',
    "updatePolicy" TEXT NOT NULL DEFAULT 'version_locked',
    "requiresPeriodicValidation" BOOLEAN NOT NULL DEFAULT false,
    "validationIntervalDays" INTEGER,
    "offlineGraceDays" INTEGER,
    "lastValidatedAt" TIMESTAMP(3),
    "nextValidationAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "listAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "amountPaid" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "upgradedAt" TIMESTAMP(3),
    "privateOfferId" TEXT,
    "pricingOverrideId" TEXT,
    "createdByUserId" TEXT,
    "metadata" JSONB,
    "schemaVersion" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerpetualLicense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseActivation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT,
    "platform" TEXT,
    "appVersion" TEXT,
    "machineFingerprintHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "activationTokenHash" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseDevice" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT,
    "platform" TEXT,
    "appVersion" TEXT,
    "machineFingerprintHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseVersionEntitlement" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "planId" TEXT,
    "version" TEXT NOT NULL,
    "majorVersion" INTEGER,
    "minimumAppVersion" TEXT,
    "maximumAppVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseVersionEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseValidationEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "licenseId" TEXT NOT NULL,
    "activationId" TEXT,
    "deviceId" TEXT,
    "appVersion" TEXT,
    "result" TEXT NOT NULL,
    "message" TEXT,
    "details" JSONB,
    "validatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseValidationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseUpgradeOffer" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "fromPlanId" TEXT,
    "toPlanId" TEXT NOT NULL,
    "upgradeType" TEXT NOT NULL,
    "fromVersion" TEXT,
    "toVersion" TEXT,
    "oldLimits" JSONB,
    "newLimits" JSONB,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "baseAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "creditAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "amountDue" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'quoted',
    "calculation" JSONB NOT NULL,
    "quoteExpiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "requestedByUserId" TEXT,
    "appliedByUserId" TEXT,
    "metadata" JSONB,
    "schemaVersion" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseUpgradeOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRelease" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "majorVersion" INTEGER,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "releaseNotes" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "channel" TEXT NOT NULL DEFAULT 'stable',
    "minimumAppVersion" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAnnouncement" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'general',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "titleKey" TEXT,
    "bodyKey" TEXT,
    "defaultTitle" TEXT NOT NULL,
    "defaultBody" TEXT NOT NULL,
    "translations" JSONB,
    "actionLabelKey" TEXT,
    "actionUrl" TEXT,
    "actionType" TEXT,
    "audience" JSONB,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAnnouncementReceipt" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "membershipId" TEXT,
    "deviceId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "seenAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAnnouncementReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFeedback" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "schoolId" TEXT,
    "branchId" TEXT,
    "submittedByUserId" TEXT,
    "submittedByMembershipId" TEXT,
    "submittedByName" TEXT,
    "submittedByEmail" TEXT,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "locale" TEXT,
    "appVersion" TEXT,
    "deviceId" TEXT,
    "pageRoute" TEXT,
    "attachments" JSONB,
    "diagnosticContext" JSONB,
    "assignedToUserId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFeedbackMessage" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "attachments" JSONB,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformFeedbackMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFeedbackStatusEvent" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformFeedbackStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportedLocale" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "region" TEXT,
    "nativeName" TEXT NOT NULL,
    "englishName" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'ltr',
    "fallbackCode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "completenessPercent" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportedLocale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PerpetualLicense_licenseKeyHash_key" ON "PerpetualLicense"("licenseKeyHash");

-- CreateIndex
CREATE INDEX "PerpetualLicense_accountId_idx" ON "PerpetualLicense"("accountId");

-- CreateIndex
CREATE INDEX "PerpetualLicense_planId_idx" ON "PerpetualLicense"("planId");

-- CreateIndex
CREATE INDEX "PerpetualLicense_status_idx" ON "PerpetualLicense"("status");

-- CreateIndex
CREATE INDEX "PerpetualLicense_licenseKeyPrefix_idx" ON "PerpetualLicense"("licenseKeyPrefix");

-- CreateIndex
CREATE INDEX "PerpetualLicense_entitledVersion_idx" ON "PerpetualLicense"("entitledVersion");

-- CreateIndex
CREATE INDEX "PerpetualLicense_nextValidationAt_idx" ON "PerpetualLicense"("nextValidationAt");

-- CreateIndex
CREATE INDEX "PerpetualLicense_createdAt_idx" ON "PerpetualLicense"("createdAt");

-- CreateIndex
CREATE INDEX "LicenseActivation_accountId_idx" ON "LicenseActivation"("accountId");

-- CreateIndex
CREATE INDEX "LicenseActivation_licenseId_idx" ON "LicenseActivation"("licenseId");

-- CreateIndex
CREATE INDEX "LicenseActivation_deviceId_idx" ON "LicenseActivation"("deviceId");

-- CreateIndex
CREATE INDEX "LicenseActivation_status_idx" ON "LicenseActivation"("status");

-- CreateIndex
CREATE INDEX "LicenseActivation_lastCheckedAt_idx" ON "LicenseActivation"("lastCheckedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseActivation_licenseId_deviceId_key" ON "LicenseActivation"("licenseId", "deviceId");

-- CreateIndex
CREATE INDEX "LicenseDevice_accountId_idx" ON "LicenseDevice"("accountId");

-- CreateIndex
CREATE INDEX "LicenseDevice_licenseId_idx" ON "LicenseDevice"("licenseId");

-- CreateIndex
CREATE INDEX "LicenseDevice_status_idx" ON "LicenseDevice"("status");

-- CreateIndex
CREATE INDEX "LicenseDevice_lastSeenAt_idx" ON "LicenseDevice"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseDevice_licenseId_deviceId_key" ON "LicenseDevice"("licenseId", "deviceId");

-- CreateIndex
CREATE INDEX "LicenseVersionEntitlement_accountId_idx" ON "LicenseVersionEntitlement"("accountId");

-- CreateIndex
CREATE INDEX "LicenseVersionEntitlement_planId_idx" ON "LicenseVersionEntitlement"("planId");

-- CreateIndex
CREATE INDEX "LicenseVersionEntitlement_status_idx" ON "LicenseVersionEntitlement"("status");

-- CreateIndex
CREATE INDEX "LicenseVersionEntitlement_expiresAt_idx" ON "LicenseVersionEntitlement"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseVersionEntitlement_licenseId_version_key" ON "LicenseVersionEntitlement"("licenseId", "version");

-- CreateIndex
CREATE INDEX "LicenseValidationEvent_licenseId_idx" ON "LicenseValidationEvent"("licenseId");

-- CreateIndex
CREATE INDEX "LicenseValidationEvent_activationId_idx" ON "LicenseValidationEvent"("activationId");

-- CreateIndex
CREATE INDEX "LicenseValidationEvent_deviceId_idx" ON "LicenseValidationEvent"("deviceId");

-- CreateIndex
CREATE INDEX "LicenseValidationEvent_result_idx" ON "LicenseValidationEvent"("result");

-- CreateIndex
CREATE INDEX "LicenseValidationEvent_validatedAt_idx" ON "LicenseValidationEvent"("validatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseUpgradeOffer_invoiceId_key" ON "LicenseUpgradeOffer"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseUpgradeOffer_paymentId_key" ON "LicenseUpgradeOffer"("paymentId");

-- CreateIndex
CREATE INDEX "LicenseUpgradeOffer_accountId_idx" ON "LicenseUpgradeOffer"("accountId");

-- CreateIndex
CREATE INDEX "LicenseUpgradeOffer_licenseId_idx" ON "LicenseUpgradeOffer"("licenseId");

-- CreateIndex
CREATE INDEX "LicenseUpgradeOffer_fromPlanId_idx" ON "LicenseUpgradeOffer"("fromPlanId");

-- CreateIndex
CREATE INDEX "LicenseUpgradeOffer_toPlanId_idx" ON "LicenseUpgradeOffer"("toPlanId");

-- CreateIndex
CREATE INDEX "LicenseUpgradeOffer_upgradeType_idx" ON "LicenseUpgradeOffer"("upgradeType");

-- CreateIndex
CREATE INDEX "LicenseUpgradeOffer_status_idx" ON "LicenseUpgradeOffer"("status");

-- CreateIndex
CREATE INDEX "LicenseUpgradeOffer_quoteExpiresAt_idx" ON "LicenseUpgradeOffer"("quoteExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformRelease_version_key" ON "PlatformRelease"("version");

-- CreateIndex
CREATE INDEX "PlatformRelease_majorVersion_idx" ON "PlatformRelease"("majorVersion");

-- CreateIndex
CREATE INDEX "PlatformRelease_status_idx" ON "PlatformRelease"("status");

-- CreateIndex
CREATE INDEX "PlatformRelease_channel_idx" ON "PlatformRelease"("channel");

-- CreateIndex
CREATE INDEX "PlatformRelease_publishedAt_idx" ON "PlatformRelease"("publishedAt");

-- CreateIndex
CREATE INDEX "PlatformAnnouncement_releaseId_idx" ON "PlatformAnnouncement"("releaseId");

-- CreateIndex
CREATE INDEX "PlatformAnnouncement_type_idx" ON "PlatformAnnouncement"("type");

-- CreateIndex
CREATE INDEX "PlatformAnnouncement_priority_idx" ON "PlatformAnnouncement"("priority");

-- CreateIndex
CREATE INDEX "PlatformAnnouncement_status_idx" ON "PlatformAnnouncement"("status");

-- CreateIndex
CREATE INDEX "PlatformAnnouncement_startsAt_idx" ON "PlatformAnnouncement"("startsAt");

-- CreateIndex
CREATE INDEX "PlatformAnnouncement_expiresAt_idx" ON "PlatformAnnouncement"("expiresAt");

-- CreateIndex
CREATE INDEX "PlatformAnnouncement_publishedAt_idx" ON "PlatformAnnouncement"("publishedAt");

-- CreateIndex
CREATE INDEX "PlatformAnnouncementReceipt_announcementId_idx" ON "PlatformAnnouncementReceipt"("announcementId");

-- CreateIndex
CREATE INDEX "PlatformAnnouncementReceipt_accountId_idx" ON "PlatformAnnouncementReceipt"("accountId");

-- CreateIndex
CREATE INDEX "PlatformAnnouncementReceipt_userId_idx" ON "PlatformAnnouncementReceipt"("userId");

-- CreateIndex
CREATE INDEX "PlatformAnnouncementReceipt_membershipId_idx" ON "PlatformAnnouncementReceipt"("membershipId");

-- CreateIndex
CREATE INDEX "PlatformAnnouncementReceipt_deviceId_idx" ON "PlatformAnnouncementReceipt"("deviceId");

-- CreateIndex
CREATE INDEX "PlatformAnnouncementReceipt_seenAt_idx" ON "PlatformAnnouncementReceipt"("seenAt");

-- CreateIndex
CREATE INDEX "PlatformAnnouncementReceipt_acknowledgedAt_idx" ON "PlatformAnnouncementReceipt"("acknowledgedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAnnouncementReceipt_announcementId_accountId_userId_key" ON "PlatformAnnouncementReceipt"("announcementId", "accountId", "userId", "membershipId");

-- CreateIndex
CREATE INDEX "PlatformFeedback_accountId_idx" ON "PlatformFeedback"("accountId");

-- CreateIndex
CREATE INDEX "PlatformFeedback_schoolId_branchId_idx" ON "PlatformFeedback"("schoolId", "branchId");

-- CreateIndex
CREATE INDEX "PlatformFeedback_submittedByUserId_idx" ON "PlatformFeedback"("submittedByUserId");

-- CreateIndex
CREATE INDEX "PlatformFeedback_type_idx" ON "PlatformFeedback"("type");

-- CreateIndex
CREATE INDEX "PlatformFeedback_priority_idx" ON "PlatformFeedback"("priority");

-- CreateIndex
CREATE INDEX "PlatformFeedback_status_idx" ON "PlatformFeedback"("status");

-- CreateIndex
CREATE INDEX "PlatformFeedback_assignedToUserId_idx" ON "PlatformFeedback"("assignedToUserId");

-- CreateIndex
CREATE INDEX "PlatformFeedback_createdAt_idx" ON "PlatformFeedback"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformFeedbackMessage_feedbackId_idx" ON "PlatformFeedbackMessage"("feedbackId");

-- CreateIndex
CREATE INDEX "PlatformFeedbackMessage_authorUserId_idx" ON "PlatformFeedbackMessage"("authorUserId");

-- CreateIndex
CREATE INDEX "PlatformFeedbackMessage_internal_idx" ON "PlatformFeedbackMessage"("internal");

-- CreateIndex
CREATE INDEX "PlatformFeedbackMessage_createdAt_idx" ON "PlatformFeedbackMessage"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformFeedbackStatusEvent_feedbackId_idx" ON "PlatformFeedbackStatusEvent"("feedbackId");

-- CreateIndex
CREATE INDEX "PlatformFeedbackStatusEvent_toStatus_idx" ON "PlatformFeedbackStatusEvent"("toStatus");

-- CreateIndex
CREATE INDEX "PlatformFeedbackStatusEvent_changedByUserId_idx" ON "PlatformFeedbackStatusEvent"("changedByUserId");

-- CreateIndex
CREATE INDEX "PlatformFeedbackStatusEvent_createdAt_idx" ON "PlatformFeedbackStatusEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportedLocale_code_key" ON "SupportedLocale"("code");

-- CreateIndex
CREATE INDEX "SupportedLocale_language_idx" ON "SupportedLocale"("language");

-- CreateIndex
CREATE INDEX "SupportedLocale_region_idx" ON "SupportedLocale"("region");

-- CreateIndex
CREATE INDEX "SupportedLocale_active_idx" ON "SupportedLocale"("active");

-- CreateIndex
CREATE INDEX "SupportedLocale_public_idx" ON "SupportedLocale"("public");

-- CreateIndex
CREATE UNIQUE INDEX "AccountEntitlement_subscriptionId_key" ON "AccountEntitlement"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountEntitlement_perpetualLicenseId_key" ON "AccountEntitlement"("perpetualLicenseId");

-- CreateIndex
CREATE INDEX "AccountEntitlement_subscriptionId_idx" ON "AccountEntitlement"("subscriptionId");

-- CreateIndex
CREATE INDEX "AccountEntitlement_perpetualLicenseId_idx" ON "AccountEntitlement"("perpetualLicenseId");

-- CreateIndex
CREATE INDEX "AccountEntitlement_licenseModel_idx" ON "AccountEntitlement"("licenseModel");

-- CreateIndex
CREATE INDEX "AccountEntitlement_deploymentMode_idx" ON "AccountEntitlement"("deploymentMode");

-- CreateIndex
CREATE INDEX "AccountEntitlement_syncPolicy_idx" ON "AccountEntitlement"("syncPolicy");

-- CreateIndex
CREATE INDEX "AppPayment_perpetualLicenseId_idx" ON "AppPayment"("perpetualLicenseId");

-- CreateIndex
CREATE INDEX "Invoice_perpetualLicenseId_idx" ON "Invoice"("perpetualLicenseId");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_licenseModel_idx" ON "SubscriptionPlan"("licenseModel");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_deploymentMode_idx" ON "SubscriptionPlan"("deploymentMode");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_syncPolicy_idx" ON "SubscriptionPlan"("syncPolicy");

-- AddForeignKey
ALTER TABLE "AccountEntitlement" ADD CONSTRAINT "AccountEntitlement_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AccountSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEntitlement" ADD CONSTRAINT "AccountEntitlement_perpetualLicenseId_fkey" FOREIGN KEY ("perpetualLicenseId") REFERENCES "PerpetualLicense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_perpetualLicenseId_fkey" FOREIGN KEY ("perpetualLicenseId") REFERENCES "PerpetualLicense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPayment" ADD CONSTRAINT "AppPayment_perpetualLicenseId_fkey" FOREIGN KEY ("perpetualLicenseId") REFERENCES "PerpetualLicense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerpetualLicense" ADD CONSTRAINT "PerpetualLicense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerpetualLicense" ADD CONSTRAINT "PerpetualLicense_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseActivation" ADD CONSTRAINT "LicenseActivation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseActivation" ADD CONSTRAINT "LicenseActivation_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "PerpetualLicense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseDevice" ADD CONSTRAINT "LicenseDevice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseDevice" ADD CONSTRAINT "LicenseDevice_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "PerpetualLicense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseVersionEntitlement" ADD CONSTRAINT "LicenseVersionEntitlement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseVersionEntitlement" ADD CONSTRAINT "LicenseVersionEntitlement_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "PerpetualLicense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseVersionEntitlement" ADD CONSTRAINT "LicenseVersionEntitlement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseValidationEvent" ADD CONSTRAINT "LicenseValidationEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseValidationEvent" ADD CONSTRAINT "LicenseValidationEvent_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "PerpetualLicense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseUpgradeOffer" ADD CONSTRAINT "LicenseUpgradeOffer_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseUpgradeOffer" ADD CONSTRAINT "LicenseUpgradeOffer_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "PerpetualLicense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseUpgradeOffer" ADD CONSTRAINT "LicenseUpgradeOffer_fromPlanId_fkey" FOREIGN KEY ("fromPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseUpgradeOffer" ADD CONSTRAINT "LicenseUpgradeOffer_toPlanId_fkey" FOREIGN KEY ("toPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAnnouncement" ADD CONSTRAINT "PlatformAnnouncement_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "PlatformRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAnnouncementReceipt" ADD CONSTRAINT "PlatformAnnouncementReceipt_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "PlatformAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAnnouncementReceipt" ADD CONSTRAINT "PlatformAnnouncementReceipt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFeedback" ADD CONSTRAINT "PlatformFeedback_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFeedbackMessage" ADD CONSTRAINT "PlatformFeedbackMessage_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "PlatformFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFeedbackStatusEvent" ADD CONSTRAINT "PlatformFeedbackStatusEvent_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "PlatformFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
