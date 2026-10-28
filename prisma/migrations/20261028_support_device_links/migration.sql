-- Eleeveon Hub: encrypted multi-device linking, staged and additive.
-- Review against your actual deployed database before applying.
ALTER TABLE "SupportEncryptionDevice"
  ADD COLUMN "linkedAt" TIMESTAMP(3),
  ADD COLUMN "linkedByDeviceId" TEXT,
  ADD COLUMN "deviceName" TEXT;

-- Existing non-revoked devices have been used as trusted encryption recipients.
-- Preserve them during migration rather than unexpectedly locking out active users.
UPDATE "SupportEncryptionDevice"
SET "linkedAt" = "registeredAt"
WHERE "revokedAt" IS NULL AND "linkedAt" IS NULL;

CREATE INDEX "SupportEncryptionDevice_accountId_userId_linkedAt_idx"
  ON "SupportEncryptionDevice"("accountId", "userId", "linkedAt");

CREATE TABLE "SupportDeviceLink" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "targetDeviceId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  "deviceName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "approvedByDeviceId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportDeviceLink_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportDeviceLink_accountId_userId_codeHash_status_idx"
 ON "SupportDeviceLink"("accountId", "userId", "codeHash", "status");
CREATE INDEX "SupportDeviceLink_accountId_userId_status_idx" ON "SupportDeviceLink"("accountId", "userId", "status");
CREATE INDEX "SupportDeviceLink_userId_targetDeviceId_idx" ON "SupportDeviceLink"("userId", "targetDeviceId");
CREATE INDEX "SupportDeviceLink_expiresAt_idx" ON "SupportDeviceLink"("expiresAt");

CREATE TABLE "SupportHistoryKey" (
  "id" TEXT NOT NULL,
  "linkId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "targetDeviceId" TEXT NOT NULL,
  "sourceDeviceId" TEXT NOT NULL,
  "wrappedKey" JSONB NOT NULL,
  "signature" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportHistoryKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupportHistoryKey_messageId_targetDeviceId_key"
  ON "SupportHistoryKey"("messageId", "targetDeviceId");
CREATE INDEX "SupportHistoryKey_targetDeviceId_conversationId_idx"
  ON "SupportHistoryKey"("targetDeviceId", "conversationId");
CREATE INDEX "SupportHistoryKey_linkId_idx" ON "SupportHistoryKey"("linkId");
ALTER TABLE "SupportHistoryKey" ADD CONSTRAINT "SupportHistoryKey_linkId_fkey"
  FOREIGN KEY ("linkId") REFERENCES "SupportDeviceLink"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SupportPairingAttempt" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportPairingAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportPairingAttempt_userId_createdAt_idx"
  ON "SupportPairingAttempt"("userId", "createdAt");


CREATE TABLE "HubUserAppearance" (
  "userId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "backgroundKind" TEXT NOT NULL DEFAULT 'default',
  "backgroundKey" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HubUserAppearance_pkey" PRIMARY KEY ("userId")
);
CREATE INDEX "HubUserAppearance_accountId_idx" ON "HubUserAppearance"("accountId");

CREATE TABLE "HubBackgroundImage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HubBackgroundImage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HubBackgroundImage_storageKey_key" ON "HubBackgroundImage"("storageKey");
CREATE INDEX "HubBackgroundImage_accountId_userId_idx" ON "HubBackgroundImage"("accountId", "userId");
