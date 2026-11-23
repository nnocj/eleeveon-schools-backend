import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash, randomBytes } from 'node:crypto';

/** Persistent, revocable refresh sessions. No calendar-based forced sign-out. */
@Injectable()
export class DurableSessionService {
  constructor(private readonly prisma: PrismaService) {}
  private hash(secret: string) { return createHash('sha256').update(secret).digest('hex'); }
  async issue(accountId: string, userId: string, metadata: { userAgent?: string; ipAddress?: string } = {}) {
    const secret = randomBytes(48).toString('base64url');
    const record = await this.prisma.userSession.create({
      data: { accountId, userId, refreshTokenHash: this.hash(secret),
        userAgent: metadata.userAgent?.slice(0, 500), ipAddress: metadata.ipAddress?.slice(0, 100),
        expiresAt: null },
      select: { id: true },
    });
    return `${record.id}.${secret}`;
  }
  async rotate(presented: string) {
    const [id, secret, extra] = presented.split('.');
    if (!id || !secret || extra || secret.length < 40) throw new UnauthorizedException('Invalid refresh session');
    const record = await this.prisma.userSession.findUnique({
      where: { id }, include: { user: { include: { account: true } } },
    });
    if (!record || record.revokedAt || (record.expiresAt && record.expiresAt <= new Date()) ||
      !record.refreshTokenHash || record.refreshTokenHash !== this.hash(secret) ||
      !record.user.active || record.user.account.status !== 'active') {
      throw new UnauthorizedException('Session revoked or expired');
    }
    const next = randomBytes(48).toString('base64url');
    const updated = await this.prisma.userSession.updateMany({
      where: { id, refreshTokenHash: this.hash(secret), revokedAt: null },
      data: { refreshTokenHash: this.hash(next), lastSeenAt: new Date() },
    });
    if (updated.count !== 1) throw new UnauthorizedException('Refresh token already used');
    return { refreshToken: `${id}.${next}`, userId: record.userId, accountId: record.accountId };
  }
  async revoke(presented: string | undefined) {
    if (!presented) return;
    const [id, secret] = presented.split('.');
    if (!id || !secret) return;
    await this.prisma.userSession.updateMany({
      where: { id, refreshTokenHash: this.hash(secret), revokedAt: null },
      data: { revokedAt: new Date(), refreshTokenHash: null },
    });
  }
}
