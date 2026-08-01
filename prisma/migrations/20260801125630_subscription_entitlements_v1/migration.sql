-- AlterTable
ALTER TABLE "AccountSubscription" ADD COLUMN     "autoRenew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "entitlementVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "graceEndsAt" TIMESTAMP(3),
ADD COLUMN     "scheduledBillingCycle" TEXT,
ADD COLUMN     "scheduledChangeAt" TIMESTAMP(3),
ADD COLUMN     "scheduledChangeType" TEXT,
ADD COLUMN     "scheduledPlanId" TEXT,
ADD COLUMN     "schemaVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "schemaVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "SubscriptionPeriod" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "changeOrderId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "listAmount" INTEGER NOT NULL DEFAULT 0,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "creditUsed" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "calculationVersion" INTEGER NOT NULL DEFAULT 1,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionChangeOrder" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "fromPlanId" TEXT,
    "toPlanId" TEXT NOT NULL,
    "privateOfferId" TEXT,
    "pricingOverrideId" TEXT,
    "changeType" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "effectiveMode" TEXT NOT NULL DEFAULT 'immediate',
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "oldPeriodStart" TIMESTAMP(3),
    "oldPeriodEnd" TIMESTAMP(3),
    "newPeriodStart" TIMESTAMP(3) NOT NULL,
    "newPeriodEnd" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "baseAmount" INTEGER NOT NULL,
    "creditAmount" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "amountDue" INTEGER NOT NULL,
    "calculation" JSONB NOT NULL,
    "calculationVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'quoted',
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "quoteExpiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "requestedByUserId" TEXT,
    "appliedByUserId" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountEntitlement" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "planId" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "maxSchools" INTEGER,
    "maxBranches" INTEGER,
    "maxUsers" INTEGER,
    "maxStudents" INTEGER,
    "maxTeachers" INTEGER,
    "maxStorageMb" INTEGER,
    "maxApiCallsPerMonth" INTEGER,
    "featureFlags" JSONB NOT NULL,
    "limitOverrides" JSONB,
    "sourceDetails" JSONB,
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "rebuiltAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountUsageSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "schools" INTEGER NOT NULL DEFAULT 0,
    "branches" INTEGER NOT NULL DEFAULT 0,
    "users" INTEGER NOT NULL DEFAULT 0,
    "students" INTEGER NOT NULL DEFAULT 0,
    "teachers" INTEGER NOT NULL DEFAULT 0,
    "storageBytes" BIGINT NOT NULL DEFAULT 0,
    "storageMb" INTEGER NOT NULL DEFAULT 0,
    "apiCallsThisMonth" INTEGER NOT NULL DEFAULT 0,
    "entitlementVersion" INTEGER NOT NULL DEFAULT 1,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculationSource" TEXT NOT NULL DEFAULT 'reconcile',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountUsageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateOffer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "basePlanId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "priceMonthly" INTEGER,
    "priceTermly" INTEGER,
    "priceYearly" INTEGER,
    "discountType" TEXT,
    "discountValue" INTEGER,
    "featureOverrides" JSONB,
    "limitOverrides" JSONB,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "visibleToOwner" BOOLEAN NOT NULL DEFAULT false,
    "ownerLabel" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateOfferAssignment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "assignedByUserId" TEXT,
    "revokedByUserId" TEXT,
    "reason" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateOfferAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountPricingOverride" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "priceMonthly" INTEGER,
    "priceTermly" INTEGER,
    "priceYearly" INTEGER,
    "discountType" TEXT,
    "discountValue" INTEGER,
    "featureOverrides" JSONB,
    "limitOverrides" JSONB,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPricingOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountQuotaEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "operation" TEXT,
    "tableName" TEXT,
    "localId" TEXT,
    "cloudId" TEXT,
    "deviceId" TEXT,
    "currentUsage" INTEGER NOT NULL,
    "limitValue" INTEGER,
    "requestedIncrease" INTEGER NOT NULL DEFAULT 0,
    "remainingBefore" INTEGER,
    "remainingAfter" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "message" TEXT,
    "details" JSONB,
    "entitlementVersion" INTEGER NOT NULL DEFAULT 1,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountQuotaEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPeriod_changeOrderId_key" ON "SubscriptionPeriod"("changeOrderId");

-- CreateIndex
CREATE INDEX "SubscriptionPeriod_accountId_idx" ON "SubscriptionPeriod"("accountId");

-- CreateIndex
CREATE INDEX "SubscriptionPeriod_subscriptionId_idx" ON "SubscriptionPeriod"("subscriptionId");

-- CreateIndex
CREATE INDEX "SubscriptionPeriod_planId_idx" ON "SubscriptionPeriod"("planId");

-- CreateIndex
CREATE INDEX "SubscriptionPeriod_status_idx" ON "SubscriptionPeriod"("status");

-- CreateIndex
CREATE INDEX "SubscriptionPeriod_startsAt_idx" ON "SubscriptionPeriod"("startsAt");

-- CreateIndex
CREATE INDEX "SubscriptionPeriod_endsAt_idx" ON "SubscriptionPeriod"("endsAt");

-- CreateIndex
CREATE INDEX "SubscriptionPeriod_sourceType_idx" ON "SubscriptionPeriod"("sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPeriod_subscriptionId_startsAt_endsAt_key" ON "SubscriptionPeriod"("subscriptionId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionChangeOrder_invoiceId_key" ON "SubscriptionChangeOrder"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionChangeOrder_paymentId_key" ON "SubscriptionChangeOrder"("paymentId");

-- CreateIndex
CREATE INDEX "SubscriptionChangeOrder_accountId_idx" ON "SubscriptionChangeOrder"("accountId");

-- CreateIndex
CREATE INDEX "SubscriptionChangeOrder_subscriptionId_idx" ON "SubscriptionChangeOrder"("subscriptionId");

-- CreateIndex
CREATE INDEX "SubscriptionChangeOrder_fromPlanId_idx" ON "SubscriptionChangeOrder"("fromPlanId");

-- CreateIndex
CREATE INDEX "SubscriptionChangeOrder_toPlanId_idx" ON "SubscriptionChangeOrder"("toPlanId");

-- CreateIndex
CREATE INDEX "SubscriptionChangeOrder_changeType_idx" ON "SubscriptionChangeOrder"("changeType");

-- CreateIndex
CREATE INDEX "SubscriptionChangeOrder_status_idx" ON "SubscriptionChangeOrder"("status");

-- CreateIndex
CREATE INDEX "SubscriptionChangeOrder_effectiveAt_idx" ON "SubscriptionChangeOrder"("effectiveAt");

-- CreateIndex
CREATE INDEX "SubscriptionChangeOrder_quoteExpiresAt_idx" ON "SubscriptionChangeOrder"("quoteExpiresAt");

-- CreateIndex
CREATE INDEX "SubscriptionChangeOrder_createdAt_idx" ON "SubscriptionChangeOrder"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountEntitlement_accountId_key" ON "AccountEntitlement"("accountId");

-- CreateIndex
CREATE INDEX "AccountEntitlement_planId_idx" ON "AccountEntitlement"("planId");

-- CreateIndex
CREATE INDEX "AccountEntitlement_source_idx" ON "AccountEntitlement"("source");

-- CreateIndex
CREATE INDEX "AccountEntitlement_status_idx" ON "AccountEntitlement"("status");

-- CreateIndex
CREATE INDEX "AccountEntitlement_validUntil_idx" ON "AccountEntitlement"("validUntil");

-- CreateIndex
CREATE INDEX "AccountEntitlement_graceEndsAt_idx" ON "AccountEntitlement"("graceEndsAt");

-- CreateIndex
CREATE INDEX "AccountEntitlement_version_idx" ON "AccountEntitlement"("version");

-- CreateIndex
CREATE UNIQUE INDEX "AccountUsageSnapshot_accountId_key" ON "AccountUsageSnapshot"("accountId");

-- CreateIndex
CREATE INDEX "AccountUsageSnapshot_calculatedAt_idx" ON "AccountUsageSnapshot"("calculatedAt");

-- CreateIndex
CREATE INDEX "AccountUsageSnapshot_entitlementVersion_idx" ON "AccountUsageSnapshot"("entitlementVersion");

-- CreateIndex
CREATE INDEX "AccountUsageSnapshot_students_idx" ON "AccountUsageSnapshot"("students");

-- CreateIndex
CREATE INDEX "AccountUsageSnapshot_storageMb_idx" ON "AccountUsageSnapshot"("storageMb");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateOffer_code_key" ON "PrivateOffer"("code");

-- CreateIndex
CREATE INDEX "PrivateOffer_basePlanId_idx" ON "PrivateOffer"("basePlanId");

-- CreateIndex
CREATE INDEX "PrivateOffer_active_idx" ON "PrivateOffer"("active");

-- CreateIndex
CREATE INDEX "PrivateOffer_validFrom_idx" ON "PrivateOffer"("validFrom");

-- CreateIndex
CREATE INDEX "PrivateOffer_validUntil_idx" ON "PrivateOffer"("validUntil");

-- CreateIndex
CREATE INDEX "PrivateOfferAssignment_accountId_idx" ON "PrivateOfferAssignment"("accountId");

-- CreateIndex
CREATE INDEX "PrivateOfferAssignment_offerId_idx" ON "PrivateOfferAssignment"("offerId");

-- CreateIndex
CREATE INDEX "PrivateOfferAssignment_status_idx" ON "PrivateOfferAssignment"("status");

-- CreateIndex
CREATE INDEX "PrivateOfferAssignment_validUntil_idx" ON "PrivateOfferAssignment"("validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateOfferAssignment_accountId_offerId_key" ON "PrivateOfferAssignment"("accountId", "offerId");

-- CreateIndex
CREATE INDEX "AccountPricingOverride_accountId_idx" ON "AccountPricingOverride"("accountId");

-- CreateIndex
CREATE INDEX "AccountPricingOverride_planId_idx" ON "AccountPricingOverride"("planId");

-- CreateIndex
CREATE INDEX "AccountPricingOverride_active_idx" ON "AccountPricingOverride"("active");

-- CreateIndex
CREATE INDEX "AccountPricingOverride_validUntil_idx" ON "AccountPricingOverride"("validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPricingOverride_accountId_planId_key" ON "AccountPricingOverride"("accountId", "planId");

-- CreateIndex
CREATE INDEX "AccountQuotaEvent_accountId_idx" ON "AccountQuotaEvent"("accountId");

-- CreateIndex
CREATE INDEX "AccountQuotaEvent_resource_idx" ON "AccountQuotaEvent"("resource");

-- CreateIndex
CREATE INDEX "AccountQuotaEvent_eventType_idx" ON "AccountQuotaEvent"("eventType");

-- CreateIndex
CREATE INDEX "AccountQuotaEvent_status_idx" ON "AccountQuotaEvent"("status");

-- CreateIndex
CREATE INDEX "AccountQuotaEvent_tableName_localId_idx" ON "AccountQuotaEvent"("tableName", "localId");

-- CreateIndex
CREATE INDEX "AccountQuotaEvent_deviceId_idx" ON "AccountQuotaEvent"("deviceId");

-- CreateIndex
CREATE INDEX "AccountQuotaEvent_createdAt_idx" ON "AccountQuotaEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AccountSubscription_scheduledPlanId_idx" ON "AccountSubscription"("scheduledPlanId");

-- CreateIndex
CREATE INDEX "AccountSubscription_graceEndsAt_idx" ON "AccountSubscription"("graceEndsAt");

-- CreateIndex
CREATE INDEX "AccountSubscription_scheduledChangeAt_idx" ON "AccountSubscription"("scheduledChangeAt");

-- CreateIndex
CREATE INDEX "AccountSubscription_entitlementVersion_idx" ON "AccountSubscription"("entitlementVersion");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_schemaVersion_idx" ON "SubscriptionPlan"("schemaVersion");

-- AddForeignKey
ALTER TABLE "AccountSubscription" ADD CONSTRAINT "AccountSubscription_scheduledPlanId_fkey" FOREIGN KEY ("scheduledPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPeriod" ADD CONSTRAINT "SubscriptionPeriod_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPeriod" ADD CONSTRAINT "SubscriptionPeriod_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AccountSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPeriod" ADD CONSTRAINT "SubscriptionPeriod_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPeriod" ADD CONSTRAINT "SubscriptionPeriod_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "SubscriptionChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionChangeOrder" ADD CONSTRAINT "SubscriptionChangeOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionChangeOrder" ADD CONSTRAINT "SubscriptionChangeOrder_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AccountSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionChangeOrder" ADD CONSTRAINT "SubscriptionChangeOrder_fromPlanId_fkey" FOREIGN KEY ("fromPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionChangeOrder" ADD CONSTRAINT "SubscriptionChangeOrder_toPlanId_fkey" FOREIGN KEY ("toPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionChangeOrder" ADD CONSTRAINT "SubscriptionChangeOrder_privateOfferId_fkey" FOREIGN KEY ("privateOfferId") REFERENCES "PrivateOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionChangeOrder" ADD CONSTRAINT "SubscriptionChangeOrder_pricingOverrideId_fkey" FOREIGN KEY ("pricingOverrideId") REFERENCES "AccountPricingOverride"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionChangeOrder" ADD CONSTRAINT "SubscriptionChangeOrder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionChangeOrder" ADD CONSTRAINT "SubscriptionChangeOrder_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "AppPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEntitlement" ADD CONSTRAINT "AccountEntitlement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEntitlement" ADD CONSTRAINT "AccountEntitlement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountUsageSnapshot" ADD CONSTRAINT "AccountUsageSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateOffer" ADD CONSTRAINT "PrivateOffer_basePlanId_fkey" FOREIGN KEY ("basePlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateOfferAssignment" ADD CONSTRAINT "PrivateOfferAssignment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateOfferAssignment" ADD CONSTRAINT "PrivateOfferAssignment_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "PrivateOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPricingOverride" ADD CONSTRAINT "AccountPricingOverride_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPricingOverride" ADD CONSTRAINT "AccountPricingOverride_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountQuotaEvent" ADD CONSTRAINT "AccountQuotaEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
