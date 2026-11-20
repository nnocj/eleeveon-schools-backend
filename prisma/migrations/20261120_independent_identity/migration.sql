-- Independent identity: no school/person records, only issuer trust and opaque revocations.
CREATE TABLE IF NOT EXISTS "IndependentIdentityIssuer" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "licenseId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "schoolName" TEXT NOT NULL,
  "branchName" TEXT NOT NULL DEFAULT '',
  "publicKeyPem" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "IndependentIdentityIssuer_accountId_idx" ON "IndependentIdentityIssuer"("accountId");
CREATE UNIQUE INDEX IF NOT EXISTS "IndependentIdentityIssuer_scope_key" ON "IndependentIdentityIssuer"("licenseId","installationId","schoolId","branchId");
CREATE TABLE IF NOT EXISTS "IndependentIdentityRevocation" (
  "id" TEXT PRIMARY KEY,
  "issuerId" TEXT NOT NULL REFERENCES "IndependentIdentityIssuer"("id") ON DELETE CASCADE,
  "credentialId" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("issuerId","credentialId")
);
