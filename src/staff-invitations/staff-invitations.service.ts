import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/auth-user';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const emailOf = (value: string) => String(value || '').trim().toLowerCase();

@Injectable()
export class StaffInvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertManager(actor: AuthUser, role: string, schoolId: string, branchId: string) {
    if (!actor?.id || !actor.accountId) throw new ForbiddenException();
    if (!['teacher', 'branch_admin'].includes(role)) throw new BadRequestException('Unsupported staff role');
    if (!schoolId || !branchId) throw new BadRequestException('School and branch are required');
    const memberships = await this.prisma.userMembership.findMany({ where: { accountId: actor.accountId, userId: actor.id, active: true, status: 'active' } });
    const owner = memberships.some(m => m.role === 'super_admin' && !m.schoolId && !m.branchId);
    if (owner) return;
    if (role !== 'teacher' || !memberships.some(m => m.role === 'branch_admin' && m.schoolId === schoolId && m.branchId === branchId)) {
      throw new ForbiddenException('Only the Owner can invite Branch Admins; Branch Admins can invite Teachers in their own branch');
    }
  }

  async create(actor: AuthUser, body: { email: string; role: string; schoolId: string; branchId: string; teacherId?: string }) {
    const email = emailOf(body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Valid email required');
    await this.assertManager(actor, body.role, body.schoolId, body.branchId);
    if (body.role === 'teacher' && !body.teacherId) throw new BadRequestException('Select an existing teacher profile');
    if (body.role === 'branch_admin' && body.teacherId) throw new BadRequestException('Branch Admin invitation cannot include teacherId');
    // Database-backed issuance limit (works across multiple Render instances).
    // This is an account-wide safety cap, not a substitute for gateway/IP throttling.
    const issuedLastHour = await this.prisma.staffInvitation.count({
      where: { accountId: actor.accountId, createdByUserId: actor.id, createdAt: { gte: new Date(Date.now() - 3600000) } },
    });
    if (issuedLastHour >= 10) throw new ForbiddenException('Invitation limit reached; try again later');
    const pendingForEmail = await this.prisma.staffInvitation.count({
      where: { accountId: actor.accountId, email, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (pendingForEmail >= 3) throw new ConflictException('Too many pending invitations for this address');
    const existing = await this.prisma.appUser.findUnique({ where: { email }, select: { accountId: true } });
    if (existing && existing.accountId !== actor.accountId) throw new ConflictException('This email belongs to another Eleeveon account; contact support');
    // Single-use secret: store only its digest; never return it from list endpoints.
    const token = randomBytes(32).toString('base64url');
    const invitation = await this.prisma.staffInvitation.create({ data: {
      accountId: actor.accountId, email, role: body.role, schoolId: body.schoolId,
      branchId: body.branchId, teacherId: body.role === 'teacher' ? body.teacherId : null,
      tokenHash: hash(token), createdByUserId: actor.id, expiresAt: new Date(Date.now() + 7 * 86400000),
    } });
    await this.prisma.auditLog.create({ data: {
      accountId: actor.accountId, actorUserId: actor.id, action: 'staff_invitation.created',
      moduleKey: 'staff', entityType: 'StaffInvitation', entityId: invitation.id,
      schoolId: invitation.schoolId, branchId: invitation.branchId,
      metadata: { role: invitation.role },
    } });
    return { id: invitation.id, token, expiresAt: invitation.expiresAt, email, role: invitation.role };
  }

  async preview(token: string) {
    if (!token || token.length > 200) throw new BadRequestException('Invalid invitation');
    const invitation = await this.prisma.staffInvitation.findUnique({ where: { tokenHash: hash(token) } });
    if (!invitation || invitation.usedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) throw new NotFoundException('Invitation expired or unavailable');
    return { email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt };
  }

  async accept(token: string, body: { fullName?: string; password?: string }, actor?: AuthUser) {
    if (!token || token.length > 200) throw new BadRequestException('Invalid invitation');
    const tokenHash = hash(token);
    return this.prisma.$transaction(async tx => {
      // Lock the invitation through an atomic conditional update, so concurrent redemption cannot succeed twice.
      const claim = await tx.staffInvitation.updateMany({ where: { tokenHash, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (claim.count !== 1) throw new BadRequestException('Invitation expired or already used');
      const invite = await tx.staffInvitation.findUniqueOrThrow({ where: { tokenHash } });
      let user = await tx.appUser.findUnique({ where: { email: invite.email } });
      if (user) {
        if (!actor || actor.id !== user.id || actor.accountId !== invite.accountId) throw new ForbiddenException('Sign in with the invited email before accepting');
        if (!user.active) throw new ForbiddenException('Inactive user');
      } else {
        if (actor) throw new ForbiddenException('Sign out before creating the invited staff account');
        if (!body.fullName?.trim() || !body.password || body.password.length < 12 || body.password.length > 128) throw new BadRequestException('Name and password (12–128 characters) required');
        user = await tx.appUser.create({ data: { accountId: invite.accountId, fullName: body.fullName.trim(), email: invite.email, passwordHash: await bcrypt.hash(body.password, 12), role: invite.role, active: true } });
      }
      const scopeKey = invite.role === 'teacher' ? `teacher:teacher:${invite.teacherId}` : `branch_admin:branch:${invite.branchId}`;
      const membership = await tx.userMembership.upsert({
        where: { accountId_userId_scopeKey: { accountId: invite.accountId, userId: user.id, scopeKey } },
        create: { accountId: invite.accountId, userId: user.id, role: invite.role, schoolId: invite.schoolId, branchId: invite.branchId, teacherId: invite.teacherId, scopeKey, active: true, status: 'active', acceptedAt: new Date(), createdByUserId: invite.createdByUserId },
        update: { active: true, status: 'active', endedAt: null, suspendedAt: null, acceptedAt: new Date() },
      });
      await tx.auditLog.create({ data: {
        accountId: invite.accountId, actorUserId: user.id, action: 'staff_invitation.accepted',
        moduleKey: 'staff', entityType: 'StaffInvitation', entityId: invite.id,
        schoolId: invite.schoolId, branchId: invite.branchId,
        metadata: { role: invite.role, membershipId: membership.id },
      } });
      return { ok: true, membershipId: membership.id, requiresLogin: !actor };
    });
  }

  async revoke(actor: AuthUser, id: string) {
    const invitation = await this.prisma.staffInvitation.findUnique({ where: { id } });
    if (!invitation || invitation.accountId !== actor.accountId) throw new NotFoundException();
    await this.assertManager(actor, invitation.role, invitation.schoolId, invitation.branchId);
    await this.prisma.staffInvitation.updateMany({ where: { id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.prisma.auditLog.create({ data: {
      accountId: actor.accountId, actorUserId: actor.id, action: 'staff_invitation.revoked',
      moduleKey: 'staff', entityType: 'StaffInvitation', entityId: id,
      schoolId: invitation.schoolId, branchId: invitation.branchId,
      metadata: { role: invitation.role },
    } });
    return { ok: true };
  }
}
