-- AlterTable
ALTER TABLE "IdentityCardRegistry" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text,
ALTER COLUMN "publicId" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "IdentityCardRegistryEvent" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "IdentityIssuancePolicy" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "SupportEncryptionDevice" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptionPublicJwk" JSONB NOT NULL,
    "signingPublicJwk" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SupportEncryptionDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EleeveonSurvey" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "questions" JSONB NOT NULL,
    "targeting" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdByUserId" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EleeveonSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EleeveonSurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT,
    "answers" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EleeveonSurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EleeveonSupportPresence" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "activity" TEXT NOT NULL DEFAULT 'online',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EleeveonSupportPresence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EleeveonSupportSignal" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EleeveonSupportSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EleeveonSupportDirectUpload" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "expectedBytes" INTEGER NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EleeveonSupportDirectUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportEncryptionDevice_accountId_userId_idx" ON "SupportEncryptionDevice"("accountId", "userId");

-- CreateIndex
CREATE INDEX "SupportEncryptionDevice_userId_revokedAt_idx" ON "SupportEncryptionDevice"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "SupportEncryptionDevice_revokedAt_idx" ON "SupportEncryptionDevice"("revokedAt");

-- CreateIndex
CREATE INDEX "EleeveonSurvey_status_createdAt_idx" ON "EleeveonSurvey"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EleeveonSurvey_createdByUserId_idx" ON "EleeveonSurvey"("createdByUserId");

-- CreateIndex
CREATE INDEX "EleeveonSurveyResponse_surveyId_submittedAt_idx" ON "EleeveonSurveyResponse"("surveyId", "submittedAt");

-- CreateIndex
CREATE INDEX "EleeveonSurveyResponse_accountId_submittedAt_idx" ON "EleeveonSurveyResponse"("accountId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EleeveonSurveyResponse_surveyId_userId_key" ON "EleeveonSurveyResponse"("surveyId", "userId");

-- CreateIndex
CREATE INDEX "EleeveonSupportPresence_feedbackId_expiresAt_idx" ON "EleeveonSupportPresence"("feedbackId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EleeveonSupportPresence_feedbackId_userId_key" ON "EleeveonSupportPresence"("feedbackId", "userId");

-- CreateIndex
CREATE INDEX "EleeveonSupportSignal_feedbackId_createdAt_idx" ON "EleeveonSupportSignal"("feedbackId", "createdAt");

-- CreateIndex
CREATE INDEX "EleeveonSupportSignal_expiresAt_idx" ON "EleeveonSupportSignal"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EleeveonSupportDirectUpload_storageKey_key" ON "EleeveonSupportDirectUpload"("storageKey");

-- CreateIndex
CREATE INDEX "EleeveonSupportDirectUpload_feedbackId_userId_messageId_idx" ON "EleeveonSupportDirectUpload"("feedbackId", "userId", "messageId");

-- CreateIndex
CREATE INDEX "EleeveonSupportDirectUpload_expiresAt_idx" ON "EleeveonSupportDirectUpload"("expiresAt");

-- AddForeignKey
ALTER TABLE "EleeveonSurveyResponse" ADD CONSTRAINT "EleeveonSurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "EleeveonSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
