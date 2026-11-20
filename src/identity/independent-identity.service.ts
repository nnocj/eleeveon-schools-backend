import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/auth-user';

const validText = (v: unknown, max = 120) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f]/.test(v);
const base64url = (s: string) => /^[A-Za-z0-9_-]+$/.test(s);
@Injectable()
export class IndependentIdentityService {
  constructor(private readonly db: PrismaService) {}
  private async authorize(actor: AuthUser, schoolId: string, branchId: string, licenseId: string, installationId: string) {
    if (!actor?.accountId || !validText(schoolId) || !validText(branchId) || !validText(licenseId) || !validText(installationId)) throw new ForbiddenException('Invalid issuer scope');
    const memberships = actor.memberships || [];
    const authorized = memberships.some(m => m.active !== false && m.accountId === actor.accountId && ['owner','super_admin','admin','branch_admin'].includes(m.role) && (!m.schoolId || m.schoolId === schoolId) && (!m.branchId || m.branchId === branchId));
    const owner = memberships.length === 0 && ['owner','super_admin'].includes(String(actor.activeRole || actor.role)) && (!actor.schoolId || actor.schoolId === schoolId) && (!actor.branchId || actor.branchId === branchId);
    if (!authorized && !owner) throw new ForbiddenException('Branch administration required');
    const license = await this.db.perpetualLicense.findFirst({where:{id:licenseId,accountId:actor.accountId,status:'active'}});
    if (!license || !['independent_essentials','independent_multi_device'].includes(String(license.licenseEdition))) throw new ForbiddenException('Active Independent license required');
    const activation = await this.db.licenseActivation.findFirst({where:{licenseId,accountId:actor.accountId,status:'active',OR:[{installationId},{deviceId:installationId}]}});
    if (!activation) throw new ForbiddenException('License not activated for this browser installation');
    return license;
  }
  async register(actor: AuthUser, body: any) {
    const {licenseId,installationId,schoolId,branchId,schoolName,branchName,publicKeyPem} = body || {};
    await this.authorize(actor,schoolId,branchId,licenseId,installationId);
    if (!validText(schoolName,140) || (branchName && !validText(branchName,140)) || !(typeof publicKeyPem === 'string' && publicKeyPem.length < 2000 && publicKeyPem.includes('BEGIN PUBLIC KEY'))) throw new BadRequestException('Invalid issuer information');
    let key; try {key = createPublicKey(publicKeyPem);} catch {throw new BadRequestException('Invalid public key');}
    if (key.asymmetricKeyType !== 'ed25519') throw new BadRequestException('Ed25519 public key required');
    const current = await this.db.independentIdentityIssuer.findUnique({where:{independentIssuerScope:{licenseId,installationId,schoolId,branchId}}});
    // Never silently replace a registered signing key: existing cards would become untrusted.
    if (current && current.publicKeyPem !== publicKeyPem) throw new ForbiddenException('Issuer already registered with another key; contact Eleeveon support for key rotation');
    if (current && current.status !== 'active') throw new ForbiddenException('Issuer is disabled');
    if (current) return {kid:current.id,status:'active'};
    const issuer = await this.db.independentIdentityIssuer.create({data:{id:randomUUID(),accountId:actor.accountId,licenseId,installationId,schoolId,branchId,schoolName,branchName:branchName||'',publicKeyPem}});
    return {kid:issuer.id,status:'active'};
  }
  async revoke(actor: AuthUser, body: any) {
    const {kid,credentialId} = body || {};
    if (!validText(kid,100) || !validText(credentialId,100)) throw new BadRequestException('Invalid revocation');
    const issuer = await this.db.independentIdentityIssuer.findUnique({where:{id:kid}});
    if (!issuer || issuer.accountId !== actor.accountId) throw new NotFoundException('Issuer not found');
    await this.authorize(actor,issuer.schoolId,issuer.branchId,issuer.licenseId,issuer.installationId);
    await this.db.independentIdentityRevocation.upsert({where:{issuerId_credentialId:{issuerId:kid,credentialId}},create:{issuerId:kid,credentialId},update:{}});
    return {status:'revoked'};
  }
  async verify(token: string) {
    const invalid = (status='invalid') => ({valid:false,status});
    if (typeof token !== 'string' || token.length > 2500) return invalid();
    const parts=token.split('.');
    if (parts.length!==3 || parts[0]!=='eid1' || !base64url(parts[1]) || !base64url(parts[2]) || parts[1].length>2000 || parts[2].length!==86) return invalid();
    let p:any; try {p=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));} catch{return invalid();}
    if (!p || p.v!==1 || !validText(p.kid,100) || !validText(p.cid,100) || !validText(p.sid) || !validText(p.bid) || !['student','teacher'].includes(p.typ) || !validText(p.ref) || (p.name!==undefined && !validText(p.name,140)) || (p.className!==undefined && !validText(p.className,100)) || !Number.isSafeInteger(p.iat) || !Number.isSafeInteger(p.exp) || p.exp<=p.iat || p.exp-p.iat>10*365*86400) return invalid();
    const issuer=await this.db.independentIdentityIssuer.findUnique({where:{id:p.kid}});
    if (!issuer || issuer.status!=='active' || issuer.schoolId!==p.sid || issuer.branchId!==p.bid) return invalid('untrusted_issuer');
    try {if(!verifySignature(null,Buffer.from(`eid1.${parts[1]}`),createPublicKey(issuer.publicKeyPem),Buffer.from(parts[2],'base64url')))return invalid();} catch{return invalid();}
    if (p.iat>Math.floor(Date.now()/1000)+300) return invalid();
    if (p.exp<Math.floor(Date.now()/1000)) return invalid('expired');
    const revoked=await this.db.independentIdentityRevocation.findUnique({where:{issuerId_credentialId:{issuerId:issuer.id,credentialId:p.cid}}});
    if (revoked) return invalid('revoked');
    return {valid:true,status:'signature_valid',revocationStatus:'not_reported',fullName:p.name||'',subjectType:p.typ,credentialReference:p.ref,schoolName:issuer.schoolName,branchName:issuer.branchName,className:p.className||'',issuedAt:new Date(p.iat*1000).toISOString(),expiresAt:new Date(p.exp*1000).toISOString()};
  }
}
