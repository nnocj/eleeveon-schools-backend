/** SERVER ONLY. Offline certificates use a separate ES256 private signing key.
 * Never import this into frontend or package the private PEM with a native app.
 * A paid, active perpetual licence and an approved device activation MUST be checked
 * by the calling backend service before issuing a certificate.
 */
import { createPrivateKey, sign } from 'node:crypto';
export type OfflineCertificateEnvelope = { alg:'ES256'; kid:string; payload:string; signature:string };
export function signOfflineCertificate(params: { claims: Record<string,unknown>; keyId:string; privateKeyPem:string }):OfflineCertificateEnvelope {
  if (!params.keyId || !params.privateKeyPem) throw new Error('Offline signing key is not configured');
  const payload=JSON.stringify(params.claims);
  // Node IEEE-P1363 signature (64 bytes) is compatible with WebCrypto ECDSA verify.
  const signature=sign('sha256',Buffer.from(payload,'utf8'),{key:createPrivateKey(params.privateKeyPem),dsaEncoding:'ieee-p1363'}).toString('base64url');
  return { alg:'ES256',kid:params.keyId,payload,signature };
}
