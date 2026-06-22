-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "description" TEXT,
    "logoMediaId" TEXT,
    "photoMediaId" TEXT,
    "bannerMediaId" TEXT,
    "country" TEXT DEFAULT 'GH',
    "currency" TEXT DEFAULT 'GHS',
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'super_admin',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "deviceId" TEXT,
    "deviceName" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMembership" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "schoolId" INTEGER,
    "branchId" INTEGER,
    "teacherLocalId" INTEGER,
    "studentLocalId" INTEGER,
    "parentLocalId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionRule" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "moduleLabel" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT 'yes',
    "admin" TEXT NOT NULL DEFAULT 'no',
    "branch" TEXT NOT NULL DEFAULT 'no',
    "teacher" TEXT NOT NULL DEFAULT 'no',
    "student" TEXT NOT NULL DEFAULT 'no',
    "parent" TEXT NOT NULL DEFAULT 'no',
    "accountant" TEXT NOT NULL DEFAULT 'no',
    "developer" TEXT NOT NULL DEFAULT 'no',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRecord" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "localId" INTEGER,
    "cloudId" TEXT,
    "deviceId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" BIGINT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncDevice" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "deviceId" TEXT NOT NULL,
    "name" TEXT,
    "platform" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "lastPushAt" TIMESTAMP(3),
    "lastPullAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncConflict" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "localId" INTEGER,
    "cloudId" TEXT,
    "deviceId" TEXT,
    "conflictType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "serverPayload" JSONB,
    "clientPayload" JSONB,
    "resolutionPayload" JSONB,
    "note" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,

    CONSTRAINT "SyncConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "priceMonthly" INTEGER NOT NULL DEFAULT 0,
    "priceYearly" INTEGER NOT NULL DEFAULT 0,
    "maxSchools" INTEGER,
    "maxBranches" INTEGER,
    "maxUsers" INTEGER,
    "maxStudents" INTEGER,
    "maxTeachers" INTEGER,
    "maxStorageMb" INTEGER,
    "maxApiCallsPerMonth" INTEGER,
    "offlineSync" BOOLEAN NOT NULL DEFAULT true,
    "cloudBackup" BOOLEAN NOT NULL DEFAULT false,
    "reports" BOOLEAN NOT NULL DEFAULT true,
    "finance" BOOLEAN NOT NULL DEFAULT false,
    "parentPortal" BOOLEAN NOT NULL DEFAULT false,
    "studentPortal" BOOLEAN NOT NULL DEFAULT false,
    "teacherPortal" BOOLEAN NOT NULL DEFAULT true,
    "advancedAnalytics" BOOLEAN NOT NULL DEFAULT false,
    "apiAccess" BOOLEAN NOT NULL DEFAULT false,
    "webhooks" BOOLEAN NOT NULL DEFAULT false,
    "prioritySupport" BOOLEAN NOT NULL DEFAULT false,
    "features" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountSubscription" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trial',
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "nextBillingDate" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppPayment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "invoiceId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "method" TEXT NOT NULL,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "providerReference" TEXT,
    "accessCode" TEXT,
    "authorizationUrl" TEXT,
    "receiptNumber" TEXT,
    "payerName" TEXT,
    "payerPhone" TEXT,
    "payerEmail" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProviderEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "paymentId" TEXT,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerReference" TEXT,
    "rawPayload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiClient" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "clientType" TEXT NOT NULL DEFAULT 'internal',
    "allowedOrigins" JSONB,
    "allowedIps" JSONB,
    "scopes" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretHash" TEXT,
    "events" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 20,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "webhookId" TEXT,
    "eventType" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "requestPayload" JSONB,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "error" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "deliveredAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationMapping" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "targetSystem" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "localTable" TEXT,
    "localId" INTEGER,
    "localCloudId" TEXT,
    "externalId" TEXT NOT NULL,
    "externalRef" TEXT,
    "metadata" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "moduleKey" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "schoolId" INTEGER,
    "branchId" INTEGER,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageUsage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "usedBytes" BIGINT NOT NULL DEFAULT 0,
    "usedMb" INTEGER NOT NULL DEFAULT 0,
    "limitMb" INTEGER,
    "imageBytes" BIGINT NOT NULL DEFAULT 0,
    "documentBytes" BIGINT NOT NULL DEFAULT 0,
    "backupBytes" BIGINT NOT NULL DEFAULT 0,
    "otherBytes" BIGINT NOT NULL DEFAULT 0,
    "lastCalculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountFeatureFlag" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "value" JSONB,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountSystemSetting" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountSystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDeliveryLog" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "schoolId" INTEGER,
    "branchId" INTEGER,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "recipientType" TEXT,
    "recipientLocalId" INTEGER,
    "recipientName" TEXT,
    "recipientPhone" TEXT,
    "recipientEmail" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "provider" TEXT,
    "providerReference" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");

-- CreateIndex
CREATE INDEX "Account_email_idx" ON "Account"("email");

-- CreateIndex
CREATE INDEX "Account_status_idx" ON "Account"("status");

-- CreateIndex
CREATE INDEX "Account_createdAt_idx" ON "Account"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "AppUser_accountId_idx" ON "AppUser"("accountId");

-- CreateIndex
CREATE INDEX "AppUser_email_idx" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "AppUser_role_idx" ON "AppUser"("role");

-- CreateIndex
CREATE INDEX "AppUser_active_idx" ON "AppUser"("active");

-- CreateIndex
CREATE INDEX "AppUser_lastLoginAt_idx" ON "AppUser"("lastLoginAt");

-- CreateIndex
CREATE INDEX "UserSession_accountId_idx" ON "UserSession"("accountId");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_deviceId_idx" ON "UserSession"("deviceId");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "UserSession_revokedAt_idx" ON "UserSession"("revokedAt");

-- CreateIndex
CREATE INDEX "UserMembership_accountId_idx" ON "UserMembership"("accountId");

-- CreateIndex
CREATE INDEX "UserMembership_userId_idx" ON "UserMembership"("userId");

-- CreateIndex
CREATE INDEX "UserMembership_accountId_role_idx" ON "UserMembership"("accountId", "role");

-- CreateIndex
CREATE INDEX "UserMembership_accountId_schoolId_branchId_idx" ON "UserMembership"("accountId", "schoolId", "branchId");

-- CreateIndex
CREATE INDEX "UserMembership_teacherLocalId_idx" ON "UserMembership"("teacherLocalId");

-- CreateIndex
CREATE INDEX "UserMembership_studentLocalId_idx" ON "UserMembership"("studentLocalId");

-- CreateIndex
CREATE INDEX "UserMembership_parentLocalId_idx" ON "UserMembership"("parentLocalId");

-- CreateIndex
CREATE INDEX "UserMembership_active_idx" ON "UserMembership"("active");

-- CreateIndex
CREATE INDEX "PermissionRule_accountId_idx" ON "PermissionRule"("accountId");

-- CreateIndex
CREATE INDEX "PermissionRule_locked_idx" ON "PermissionRule"("locked");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionRule_accountId_moduleKey_key" ON "PermissionRule"("accountId", "moduleKey");

-- CreateIndex
CREATE INDEX "SyncRecord_accountId_idx" ON "SyncRecord"("accountId");

-- CreateIndex
CREATE INDEX "SyncRecord_accountId_tableName_idx" ON "SyncRecord"("accountId", "tableName");

-- CreateIndex
CREATE INDEX "SyncRecord_accountId_tableName_updatedAt_idx" ON "SyncRecord"("accountId", "tableName", "updatedAt");

-- CreateIndex
CREATE INDEX "SyncRecord_accountId_tableName_cloudId_idx" ON "SyncRecord"("accountId", "tableName", "cloudId");

-- CreateIndex
CREATE INDEX "SyncRecord_deviceId_idx" ON "SyncRecord"("deviceId");

-- CreateIndex
CREATE INDEX "SyncRecord_cloudId_idx" ON "SyncRecord"("cloudId");

-- CreateIndex
CREATE INDEX "SyncRecord_isDeleted_idx" ON "SyncRecord"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "SyncRecord_accountId_tableName_localId_deviceId_key" ON "SyncRecord"("accountId", "tableName", "localId", "deviceId");

-- CreateIndex
CREATE INDEX "SyncDevice_accountId_idx" ON "SyncDevice"("accountId");

-- CreateIndex
CREATE INDEX "SyncDevice_userId_idx" ON "SyncDevice"("userId");

-- CreateIndex
CREATE INDEX "SyncDevice_active_idx" ON "SyncDevice"("active");

-- CreateIndex
CREATE INDEX "SyncDevice_lastSeenAt_idx" ON "SyncDevice"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncDevice_accountId_deviceId_key" ON "SyncDevice"("accountId", "deviceId");

-- CreateIndex
CREATE INDEX "SyncConflict_accountId_idx" ON "SyncConflict"("accountId");

-- CreateIndex
CREATE INDEX "SyncConflict_accountId_tableName_idx" ON "SyncConflict"("accountId", "tableName");

-- CreateIndex
CREATE INDEX "SyncConflict_status_idx" ON "SyncConflict"("status");

-- CreateIndex
CREATE INDEX "SyncConflict_severity_idx" ON "SyncConflict"("severity");

-- CreateIndex
CREATE INDEX "SyncConflict_detectedAt_idx" ON "SyncConflict"("detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_code_idx" ON "SubscriptionPlan"("code");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_active_idx" ON "SubscriptionPlan"("active");

-- CreateIndex
CREATE UNIQUE INDEX "AccountSubscription_accountId_key" ON "AccountSubscription"("accountId");

-- CreateIndex
CREATE INDEX "AccountSubscription_planId_idx" ON "AccountSubscription"("planId");

-- CreateIndex
CREATE INDEX "AccountSubscription_status_idx" ON "AccountSubscription"("status");

-- CreateIndex
CREATE INDEX "AccountSubscription_currentPeriodEnd_idx" ON "AccountSubscription"("currentPeriodEnd");

-- CreateIndex
CREATE INDEX "AccountSubscription_nextBillingDate_idx" ON "AccountSubscription"("nextBillingDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_accountId_idx" ON "Invoice"("accountId");

-- CreateIndex
CREATE INDEX "Invoice_subscriptionId_idx" ON "Invoice"("subscriptionId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_issueDate_idx" ON "Invoice"("issueDate");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE INDEX "AppPayment_accountId_idx" ON "AppPayment"("accountId");

-- CreateIndex
CREATE INDEX "AppPayment_subscriptionId_idx" ON "AppPayment"("subscriptionId");

-- CreateIndex
CREATE INDEX "AppPayment_invoiceId_idx" ON "AppPayment"("invoiceId");

-- CreateIndex
CREATE INDEX "AppPayment_status_idx" ON "AppPayment"("status");

-- CreateIndex
CREATE INDEX "AppPayment_method_idx" ON "AppPayment"("method");

-- CreateIndex
CREATE INDEX "AppPayment_provider_idx" ON "AppPayment"("provider");

-- CreateIndex
CREATE INDEX "AppPayment_providerReference_idx" ON "AppPayment"("providerReference");

-- CreateIndex
CREATE INDEX "AppPayment_paidAt_idx" ON "AppPayment"("paidAt");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_accountId_idx" ON "PaymentProviderEvent"("accountId");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_paymentId_idx" ON "PaymentProviderEvent"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_provider_idx" ON "PaymentProviderEvent"("provider");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_eventType_idx" ON "PaymentProviderEvent"("eventType");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_providerReference_idx" ON "PaymentProviderEvent"("providerReference");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_processed_idx" ON "PaymentProviderEvent"("processed");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_createdAt_idx" ON "PaymentProviderEvent"("createdAt");

-- CreateIndex
CREATE INDEX "BillingEvent_accountId_idx" ON "BillingEvent"("accountId");

-- CreateIndex
CREATE INDEX "BillingEvent_type_idx" ON "BillingEvent"("type");

-- CreateIndex
CREATE INDEX "BillingEvent_createdAt_idx" ON "BillingEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ApiClient_accountId_idx" ON "ApiClient"("accountId");

-- CreateIndex
CREATE INDEX "ApiClient_clientType_idx" ON "ApiClient"("clientType");

-- CreateIndex
CREATE INDEX "ApiClient_active_idx" ON "ApiClient"("active");

-- CreateIndex
CREATE INDEX "ApiClient_lastUsedAt_idx" ON "ApiClient"("lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_accountId_idx" ON "ApiKey"("accountId");

-- CreateIndex
CREATE INDEX "ApiKey_clientId_idx" ON "ApiKey"("clientId");

-- CreateIndex
CREATE INDEX "ApiKey_keyPrefix_idx" ON "ApiKey"("keyPrefix");

-- CreateIndex
CREATE INDEX "ApiKey_active_idx" ON "ApiKey"("active");

-- CreateIndex
CREATE INDEX "ApiKey_expiresAt_idx" ON "ApiKey"("expiresAt");

-- CreateIndex
CREATE INDEX "ApiKey_lastUsedAt_idx" ON "ApiKey"("lastUsedAt");

-- CreateIndex
CREATE INDEX "Webhook_accountId_idx" ON "Webhook"("accountId");

-- CreateIndex
CREATE INDEX "Webhook_clientId_idx" ON "Webhook"("clientId");

-- CreateIndex
CREATE INDEX "Webhook_active_idx" ON "Webhook"("active");

-- CreateIndex
CREATE INDEX "Webhook_lastTriggeredAt_idx" ON "Webhook"("lastTriggeredAt");

-- CreateIndex
CREATE INDEX "WebhookLog_accountId_idx" ON "WebhookLog"("accountId");

-- CreateIndex
CREATE INDEX "WebhookLog_webhookId_idx" ON "WebhookLog"("webhookId");

-- CreateIndex
CREATE INDEX "WebhookLog_eventType_idx" ON "WebhookLog"("eventType");

-- CreateIndex
CREATE INDEX "WebhookLog_status_idx" ON "WebhookLog"("status");

-- CreateIndex
CREATE INDEX "WebhookLog_createdAt_idx" ON "WebhookLog"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookLog_nextRetryAt_idx" ON "WebhookLog"("nextRetryAt");

-- CreateIndex
CREATE INDEX "IntegrationMapping_accountId_idx" ON "IntegrationMapping"("accountId");

-- CreateIndex
CREATE INDEX "IntegrationMapping_sourceSystem_idx" ON "IntegrationMapping"("sourceSystem");

-- CreateIndex
CREATE INDEX "IntegrationMapping_targetSystem_idx" ON "IntegrationMapping"("targetSystem");

-- CreateIndex
CREATE INDEX "IntegrationMapping_entityType_idx" ON "IntegrationMapping"("entityType");

-- CreateIndex
CREATE INDEX "IntegrationMapping_localTable_localId_idx" ON "IntegrationMapping"("localTable", "localId");

-- CreateIndex
CREATE INDEX "IntegrationMapping_localCloudId_idx" ON "IntegrationMapping"("localCloudId");

-- CreateIndex
CREATE INDEX "IntegrationMapping_active_idx" ON "IntegrationMapping"("active");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationMapping_accountId_sourceSystem_targetSystem_enti_key" ON "IntegrationMapping"("accountId", "sourceSystem", "targetSystem", "entityType", "externalId");

-- CreateIndex
CREATE INDEX "AuditLog_accountId_idx" ON "AuditLog"("accountId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_moduleKey_idx" ON "AuditLog"("moduleKey");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_branchId_idx" ON "AuditLog"("schoolId", "branchId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "BackgroundJob_accountId_idx" ON "BackgroundJob"("accountId");

-- CreateIndex
CREATE INDEX "BackgroundJob_type_idx" ON "BackgroundJob"("type");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_idx" ON "BackgroundJob"("status");

-- CreateIndex
CREATE INDEX "BackgroundJob_priority_idx" ON "BackgroundJob"("priority");

-- CreateIndex
CREATE INDEX "BackgroundJob_scheduledAt_idx" ON "BackgroundJob"("scheduledAt");

-- CreateIndex
CREATE INDEX "BackgroundJob_createdAt_idx" ON "BackgroundJob"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorageUsage_accountId_key" ON "StorageUsage"("accountId");

-- CreateIndex
CREATE INDEX "StorageUsage_usedMb_idx" ON "StorageUsage"("usedMb");

-- CreateIndex
CREATE INDEX "StorageUsage_limitMb_idx" ON "StorageUsage"("limitMb");

-- CreateIndex
CREATE INDEX "AccountFeatureFlag_accountId_idx" ON "AccountFeatureFlag"("accountId");

-- CreateIndex
CREATE INDEX "AccountFeatureFlag_key_idx" ON "AccountFeatureFlag"("key");

-- CreateIndex
CREATE INDEX "AccountFeatureFlag_enabled_idx" ON "AccountFeatureFlag"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AccountFeatureFlag_accountId_key_key" ON "AccountFeatureFlag"("accountId", "key");

-- CreateIndex
CREATE INDEX "AccountSystemSetting_accountId_idx" ON "AccountSystemSetting"("accountId");

-- CreateIndex
CREATE INDEX "AccountSystemSetting_key_idx" ON "AccountSystemSetting"("key");

-- CreateIndex
CREATE INDEX "AccountSystemSetting_locked_idx" ON "AccountSystemSetting"("locked");

-- CreateIndex
CREATE UNIQUE INDEX "AccountSystemSetting_accountId_key_key" ON "AccountSystemSetting"("accountId", "key");

-- CreateIndex
CREATE INDEX "NotificationDeliveryLog_accountId_idx" ON "NotificationDeliveryLog"("accountId");

-- CreateIndex
CREATE INDEX "NotificationDeliveryLog_schoolId_branchId_idx" ON "NotificationDeliveryLog"("schoolId", "branchId");

-- CreateIndex
CREATE INDEX "NotificationDeliveryLog_channel_idx" ON "NotificationDeliveryLog"("channel");

-- CreateIndex
CREATE INDEX "NotificationDeliveryLog_purpose_idx" ON "NotificationDeliveryLog"("purpose");

-- CreateIndex
CREATE INDEX "NotificationDeliveryLog_recipientUserId_idx" ON "NotificationDeliveryLog"("recipientUserId");

-- CreateIndex
CREATE INDEX "NotificationDeliveryLog_recipientType_recipientLocalId_idx" ON "NotificationDeliveryLog"("recipientType", "recipientLocalId");

-- CreateIndex
CREATE INDEX "NotificationDeliveryLog_status_idx" ON "NotificationDeliveryLog"("status");

-- CreateIndex
CREATE INDEX "NotificationDeliveryLog_providerReference_idx" ON "NotificationDeliveryLog"("providerReference");

-- CreateIndex
CREATE INDEX "NotificationDeliveryLog_createdAt_idx" ON "NotificationDeliveryLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMembership" ADD CONSTRAINT "UserMembership_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMembership" ADD CONSTRAINT "UserMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionRule" ADD CONSTRAINT "PermissionRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRecord" ADD CONSTRAINT "SyncRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSubscription" ADD CONSTRAINT "AccountSubscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSubscription" ADD CONSTRAINT "AccountSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AccountSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPayment" ADD CONSTRAINT "AppPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPayment" ADD CONSTRAINT "AppPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AccountSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPayment" ADD CONSTRAINT "AppPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "AppPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEvent" ADD CONSTRAINT "BillingEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiClient" ADD CONSTRAINT "ApiClient_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ApiClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ApiClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationMapping" ADD CONSTRAINT "IntegrationMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageUsage" ADD CONSTRAINT "StorageUsage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountFeatureFlag" ADD CONSTRAINT "AccountFeatureFlag_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSystemSetting" ADD CONSTRAINT "AccountSystemSetting_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDeliveryLog" ADD CONSTRAINT "NotificationDeliveryLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
