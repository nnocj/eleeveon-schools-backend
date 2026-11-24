import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedSessionActor } from './auth.service';
import { issueOfflineGrant } from './offline-grant-issuer';

/** Issues an offline authorization snapshot only after live database checks. */
@Injectable()
export class OfflineGrantService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(actor: AuthenticatedSessionActor, input: { membershipId: string; licenseId: string; installationId: string }) {
    if (!actor?.id || !actor.accountId || !input?.membershipId || !input.licenseId || !input.installationId || input.installationId.length > 256) {
      throw new ForbiddenException('Missing authorization scope');
    }
    const [user, membership, license, activation] = await Promise.all([
      this.prisma.appUser.findFirst({ where: { id: actor.id, accountId: actor.accountId, active: true }, select: { id: true } }),
      this.prisma.userMembership.findFirst({ where: { id: input.membershipId, accountId: actor.accountId, userId: actor.id, active: true, status: 'active', endedAt: null, suspendedAt: null } }),
      this.prisma.perpetualLicense.findFirst({ where: { id: input.licenseId, accountId: actor.accountId } }),
      this.prisma.licenseActivation.findFirst({ where: { accountId: actor.accountId, licenseId: input.licenseId, deviceId: input.installationId, status: 'active', revokedAt: null, deactivatedAt: null } }),
    ]);
    if (!user || !membership || !license || !activation || license.status !== 'active' || license.revokedAt || license.suspendedAt) {
      throw new ForbiddenException('User, membership, license or installation is not active');
    }
    const edition = license.licenseEdition === 'independent_multi_device' ? 'independent_multi_device' : license.licenseEdition === 'independent_essentials' ? 'independent_essentials' : null;
    if (!edition) throw new ForbiddenException('Unsupported Independent license edition');
    const role = membership.role === 'super_admin' ? 'owner' : membership.role;
    if (role !== 'owner' && role !== 'branch_admin' && role !== 'teacher') throw new ForbiddenException('Unsupported offline role');
    if (role === 'teacher' && (edition === 'independent_essentials' || !membership.teacherId)) throw new ForbiddenException('Teacher not permitted under this license');
    if (role !== 'owner' && (!membership.schoolId || !membership.branchId)) throw new ForbiddenException('Missing branch scope');
    const pem = process.env.ELEEVEON_OFFLINE_GRANT_PRIVATE_KEY_PEM?.replace(/\\n/g, '\n');
    const kid = process.env.ELEEVEON_OFFLINE_GRANT_KEY_ID;
    if (!pem || !kid) throw new ServiceUnavailableException('Offline authorization signing is not configured');
    const grant = issueOfflineGrant({ accountId: actor.accountId, userId: actor.id, membershipId: membership.id,
      role, schoolId: membership.schoolId, branchId: membership.branchId, teacherId: membership.teacherId,
      licenseId: license.id, edition, installationId: input.installationId,
      permissionsRevision: actor.permissionsRevision || actor.membershipRevision || membership.updatedAt.toISOString(),
    }, pem, kid);
    return { grant, keyId: kid };
  }
}
