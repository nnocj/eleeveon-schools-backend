/*
  Membership platform refactor

  This migration:
  - preserves recipientLocalId as recipientId;
  - preserves teacherLocalId, studentLocalId and parentLocalId;
  - converts numeric local/scope identifiers to TEXT explicitly;
  - backfills scopeKey before making it required;
  - checks for duplicate membership scopes before creating the unique index.
*/

-- ============================================================================
-- Remove indexes that depend on columns being renamed/replaced
-- ============================================================================

DROP INDEX IF EXISTS "NotificationDeliveryLog_recipientType_recipientLocalId_idx";

DROP INDEX IF EXISTS "UserMembership_parentLocalId_idx";
DROP INDEX IF EXISTS "UserMembership_studentLocalId_idx";
DROP INDEX IF EXISTS "UserMembership_teacherLocalId_idx";


-- ============================================================================
-- AuditLog: integer school/branch identifiers -> text identifiers
-- ============================================================================

ALTER TABLE "AuditLog"
ALTER COLUMN "schoolId" TYPE TEXT
USING "schoolId"::TEXT;

ALTER TABLE "AuditLog"
ALTER COLUMN "branchId" TYPE TEXT
USING "branchId"::TEXT;


-- ============================================================================
-- IntegrationMapping: numeric localId -> text localId
-- ============================================================================

ALTER TABLE "IntegrationMapping"
ALTER COLUMN "localId" TYPE TEXT
USING "localId"::TEXT;


-- ============================================================================
-- NotificationDeliveryLog
-- Preserve recipientLocalId before removing the old column
-- ============================================================================

ALTER TABLE "NotificationDeliveryLog"
ADD COLUMN "recipientId" TEXT;

UPDATE "NotificationDeliveryLog"
SET "recipientId" = "recipientLocalId"::TEXT
WHERE "recipientLocalId" IS NOT NULL;

ALTER TABLE "NotificationDeliveryLog"
ALTER COLUMN "schoolId" TYPE TEXT
USING "schoolId"::TEXT;

ALTER TABLE "NotificationDeliveryLog"
ALTER COLUMN "branchId" TYPE TEXT
USING "branchId"::TEXT;

ALTER TABLE "NotificationDeliveryLog"
DROP COLUMN "recipientLocalId";


-- ============================================================================
-- SyncConflict: numeric localId -> text localId
-- ============================================================================

ALTER TABLE "SyncConflict"
ALTER COLUMN "localId" TYPE TEXT
USING "localId"::TEXT;


-- ============================================================================
-- SyncRecord: numeric localId -> text localId
-- ============================================================================

ALTER TABLE "SyncRecord"
ALTER COLUMN "localId" TYPE TEXT
USING "localId"::TEXT;


-- ============================================================================
-- UserMembership
-- Add new columns as nullable first so existing rows can be migrated
-- ============================================================================

ALTER TABLE "UserMembership"
ADD COLUMN "acceptedAt" TIMESTAMP(3),
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "endedAt" TIMESTAMP(3),
ADD COLUMN "invitedAt" TIMESTAMP(3),
ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "label" TEXT,
ADD COLUMN "metadata" JSONB,
ADD COLUMN "parentId" TEXT,
ADD COLUMN "scopeKey" TEXT,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "studentId" TEXT,
ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "teacherId" TEXT;


-- Preserve the existing local profile references
UPDATE "UserMembership"
SET
  "teacherId" = CASE
    WHEN "teacherLocalId" IS NOT NULL
      THEN "teacherLocalId"::TEXT
    ELSE NULL
  END,

  "studentId" = CASE
    WHEN "studentLocalId" IS NOT NULL
      THEN "studentLocalId"::TEXT
    ELSE NULL
  END,

  "parentId" = CASE
    WHEN "parentLocalId" IS NOT NULL
      THEN "parentLocalId"::TEXT
    ELSE NULL
  END;


-- Backfill a deterministic scope key for existing memberships.
--
-- Keep this format synchronized with the scopeKey builder used by your
-- backend when creating future memberships.
UPDATE "UserMembership"
SET "scopeKey" = concat_ws(
  '|',
  'role=' || COALESCE("role", 'unknown'),
  'school=' || COALESCE("schoolId"::TEXT, 'global'),
  'branch=' || COALESCE("branchId"::TEXT, 'global'),
  CASE
    WHEN "teacherLocalId" IS NOT NULL
      THEN 'teacher=' || "teacherLocalId"::TEXT
    WHEN "studentLocalId" IS NOT NULL
      THEN 'student=' || "studentLocalId"::TEXT
    WHEN "parentLocalId" IS NOT NULL
      THEN 'parent=' || "parentLocalId"::TEXT
    ELSE 'profile=none'
  END
)
WHERE "scopeKey" IS NULL;


-- Ensure every existing membership received a scope key
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "UserMembership"
    WHERE "scopeKey" IS NULL
       OR btrim("scopeKey") = ''
  ) THEN
    RAISE EXCEPTION
      'Migration stopped: one or more UserMembership rows have no scopeKey';
  END IF;
END
$$;


-- Check whether the future unique constraint would fail.
--
-- Do not silently alter duplicate memberships because they may represent
-- accidental duplicate access records that should be reviewed explicitly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "UserMembership"
    GROUP BY "accountId", "userId", "scopeKey"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Migration stopped: duplicate UserMembership accountId/userId/scopeKey combinations exist';
  END IF;
END
$$;


-- Make scopeKey required only after existing rows have been populated
ALTER TABLE "UserMembership"
ALTER COLUMN "scopeKey" SET NOT NULL;


-- Convert school and branch identifiers explicitly
ALTER TABLE "UserMembership"
ALTER COLUMN "schoolId" TYPE TEXT
USING "schoolId"::TEXT;

ALTER TABLE "UserMembership"
ALTER COLUMN "branchId" TYPE TEXT
USING "branchId"::TEXT;


-- Remove old columns only after copying their data
ALTER TABLE "UserMembership"
DROP COLUMN "parentLocalId",
DROP COLUMN "studentLocalId",
DROP COLUMN "teacherLocalId";


-- ============================================================================
-- UserSession
-- ============================================================================

ALTER TABLE "UserSession"
ADD COLUMN "activeMembershipId" TEXT,
ADD COLUMN "activeRole" TEXT,
ADD COLUMN "branchId" TEXT,
ADD COLUMN "lastSeenAt" TIMESTAMP(3),
ADD COLUMN "schoolId" TEXT;


-- ============================================================================
-- New indexes
-- ============================================================================

CREATE INDEX "NotificationDeliveryLog_recipientType_recipientId_idx"
ON "NotificationDeliveryLog"("recipientType", "recipientId");

CREATE INDEX "UserMembership_teacherId_idx"
ON "UserMembership"("teacherId");

CREATE INDEX "UserMembership_studentId_idx"
ON "UserMembership"("studentId");

CREATE INDEX "UserMembership_parentId_idx"
ON "UserMembership"("parentId");

CREATE INDEX "UserMembership_status_idx"
ON "UserMembership"("status");

CREATE INDEX "UserMembership_isDefault_idx"
ON "UserMembership"("isDefault");

CREATE UNIQUE INDEX "UserMembership_accountId_userId_scopeKey_key"
ON "UserMembership"("accountId", "userId", "scopeKey");

CREATE INDEX "UserSession_activeMembershipId_idx"
ON "UserSession"("activeMembershipId");

CREATE INDEX "UserSession_activeRole_idx"
ON "UserSession"("activeRole");

CREATE INDEX "UserSession_schoolId_branchId_idx"
ON "UserSession"("schoolId", "branchId");

CREATE INDEX "UserSession_lastSeenAt_idx"
ON "UserSession"("lastSeenAt");


-- ============================================================================
-- Foreign keys
-- ============================================================================

ALTER TABLE "UserSession"
ADD CONSTRAINT "UserSession_accountId_fkey"
FOREIGN KEY ("accountId")
REFERENCES "Account"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;