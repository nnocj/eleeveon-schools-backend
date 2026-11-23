CREATE TABLE "StaffInvitation" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "accountId" TEXT NOT NULL,
 "email" TEXT NOT NULL,
 "role" TEXT NOT NULL,
 "schoolId" TEXT NOT NULL,
 "branchId" TEXT NOT NULL,
 "teacherId" TEXT,
 "tokenHash" TEXT NOT NULL,
 "createdByUserId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "usedAt" TIMESTAMP(3),
 "revokedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");
CREATE INDEX "StaffInvitation_accountId_email_idx" ON "StaffInvitation"("accountId", "email");
CREATE INDEX "StaffInvitation_expiresAt_idx" ON "StaffInvitation"("expiresAt");
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
