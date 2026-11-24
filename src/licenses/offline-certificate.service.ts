import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/auth-user';
import { signOfflineCertificate } from './offline-certificate-signing';
import type { LicenseActivationService } from './license-activation.service';
import { assertCertificateEligibility } from './offline-certificate-eligibility';

/** Server-only issuance; NEVER exposed without JWT and an authorized account owner. */
@Injectable()
export class OfflineCertificateService {
  constructor(private readonly prisma:PrismaService) {}
  async provisionBrowser(installationId: string, actor: AuthUser, activations: LicenseActivationService) {
    if (!actor?.accountId || !actor.id || actor.active === false) throw new ForbiddenException('Authenticated account required');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(installationId || '')) throw new BadRequestException('Invalid installation ID');
    const entitlement = await this.prisma.accountEntitlement.findUnique({where:{accountId:actor.accountId}});
    if (!entitlement || entitlement.deploymentMode !== 'offline_local' || entitlement.syncPolicy !== 'platform_only') return {kind:'not-independent' as const};
    if (entitlement.status !== 'active' || !entitlement.perpetualLicenseId) throw new ForbiddenException('Independent entitlement unavailable');
    const license = await this.prisma.perpetualLicense.findFirst({where:{id:entitlement.perpetualLicenseId,accountId:actor.accountId}});
    if (!license) throw new ForbiddenException('Independent license unavailable');
    const payments = await this.prisma.appPayment.findMany({where:{perpetualLicenseId:license.id,accountId:actor.accountId}});
    // Check commercial eligibility before consuming a device slot. The real activation is checked again at issuance.
    try { assertCertificateEligibility({license,payments,activation:{accountId:actor.accountId,deviceId:installationId,status:'active',revokedAt:null},installationId,accountId:actor.accountId}); }
    catch(e) { throw new ForbiddenException(e instanceof Error ? e.message : 'License ineligible'); }
    if (!actor.memberships?.some(m=>m.accountId===actor.accountId && m.active===true && m.status==='active' && m.role==='super_admin')) throw new ForbiddenException('Owner must provision this browser first');
    const existing = await this.prisma.licenseActivation.findUnique({where:{licenseId_deviceId:{licenseId:license.id,deviceId:installationId}}});
    if (!existing || existing.status !== 'active' || existing.installationId !== installationId) await activations.activateForOwner(license.id,installationId,actor);
    const envelope = await this.issue({licenseId:license.id,installationId},actor);
    return {kind:'independent' as const,accountId:actor.accountId,envelope};
  }
  async issue(args:{licenseId:string;installationId:string}, actor:AuthUser) {
    if(!actor || actor.active===false || !actor.accountId) throw new ForbiddenException('Authenticated account required');
    if(!actor.memberships?.some(m=>m.accountId===actor.accountId && m.active!==false && (m.role==='owner' || m.role==='super_admin' || m.role==='developer'))) {
      throw new ForbiddenException('Account owner or authorized operator required');
    }
    if(!/^[0-9a-f-]{36}$/i.test(args.installationId)) throw new BadRequestException('Invalid native installation ID');
    const kid=process.env.ELEEVEON_OFFLINE_CERTIFICATE_KEY_ID;
    const privateKey=process.env.ELEEVEON_OFFLINE_CERTIFICATE_PRIVATE_KEY_PEM?.replace(/\\n/g,'\n');
    if(!kid || !privateKey) throw new ServiceUnavailableException('Offline certificate signing is not configured');
    try {
      return await this.prisma.$transaction(async tx=>{
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`eleeveon-license:${args.licenseId}`}))`;
        const license=await tx.perpetualLicense.findUnique({where:{id:args.licenseId}});
        if(!license) throw new NotFoundException('License not found');
        if(license.accountId!==actor.accountId) throw new ForbiddenException('License does not belong to your account');
        const [payments,activation]=await Promise.all([
          tx.appPayment.findMany({where:{perpetualLicenseId:license.id,accountId:license.accountId}}),
          tx.licenseActivation.findUnique({where:{licenseId_deviceId:{licenseId:license.id,deviceId:args.installationId}}}),
        ]);
        try{assertCertificateEligibility({license,payments,activation,installationId:args.installationId,accountId:actor.accountId});}
        catch(e){throw new BadRequestException(e instanceof Error?e.message:'Not eligible for permanent offline certificate');}
        const now=Math.floor(Date.now()/1000);
        const edition=license.licenseEdition as 'independent_essentials'|'independent_multi_device';
        const claims={v:1 as const,licenseId:license.id,accountId:license.accountId,installationId:args.installationId,edition,issuedAt:now,notBefore:now-10,expiresAt:null,
          entitledMajorVersion:license.licensedMajorVersion!,limits:{schools:license.maxSchools,branches:license.maxBranches,users:license.maxUsers,students:license.maxStudents,teachers:license.maxTeachers,devices:license.deviceLimit}};
        return signOfflineCertificate({claims,keyId:kid,privateKeyPem:privateKey});
      },{timeout:15000});
    } catch(e) { throw e; }
  }
}
