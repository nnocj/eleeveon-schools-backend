import { createPrivateKey, createPublicKey, sign, randomUUID } from 'node:crypto';

/** Cryptographically signed offline permission snapshot. This is NOT a server API guard. */
export type OfflineGrantPayload = {
  typ: 'eleeveon.offline-grant.v1';
  grantId: string;
  accountId: string;
  userId: string;
  membershipId: string;
  role: 'owner' | 'branch_admin' | 'teacher';
  schoolId: string | null;
  branchId: string | null;
  teacherId: string | null;
  licenseId: string;
  edition: 'independent_essentials' | 'independent_multi_device' | 'cloud';
  installationId: string;
  permissionsRevision: string;
  issuedAt: string;
};
const base64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');
export function issueOfflineGrant(input: Omit<OfflineGrantPayload, 'typ' | 'grantId' | 'issuedAt'>, pem: string, keyId: string) {
  if (!keyId || !/^[A-Za-z0-9._-]{1,80}$/.test(keyId)) throw new Error('Invalid signing key ID');
  for (const value of [input.accountId, input.userId, input.membershipId, input.licenseId, input.installationId, input.permissionsRevision]) {
    if (!value || !value.trim()) throw new Error('Offline grant is missing a required binding');
  }
  if (input.role === 'teacher' && (!input.teacherId || input.edition === 'independent_essentials')) {
    throw new Error('Teacher permission is not included in this edition or is missing teacher assignment');
  }
  const payload: OfflineGrantPayload = { ...input, typ: 'eleeveon.offline-grant.v1', grantId: randomUUID(), issuedAt: new Date().toISOString() };
  const header = { alg: 'RS256', typ: 'JWT', kid: keyId };
  const body = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'rsa') throw new Error('Offline grant signing key must be RSA');
  const signature = sign('RSA-SHA256', Buffer.from(body), key).toString('base64url');
  return `${body}.${signature}`;
}
export function offlineGrantPublicJwk(privatePem: string) {
  return createPublicKey(createPrivateKey(privatePem)).export({ format: 'jwk' });
}
