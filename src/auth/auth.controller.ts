import { Body, Controller, Get, Post, Req, Res, UseGuards, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, type AuthenticatedSessionActor } from './auth.service';
import { DurableSessionService } from './durable-session.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OfflineGrantService } from './offline-grant.service';

type AuthenticatedRequest = Request & { user: AuthenticatedSessionActor };
const COOKIE = 'eleeveon_refresh';
function cookieValue(req: Request): string | undefined {
  const match = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`));
  if (!match) return undefined;
  try { return decodeURIComponent(match.slice(COOKIE.length + 1)); } catch { return undefined; }
}
function allowedOrigin(req: Request) {
  const origin = req.headers.origin;
  if (!origin) throw new ForbiddenException('Origin header required for session changes');
  const allowed = (process.env.ELEEVEON_ALLOWED_FRONTEND_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!allowed.includes(origin)) throw new ForbiddenException('Untrusted session origin');
}
function cookieOptions(req: Request) {
  // Cross-origin frontend/backend requires SameSite=None; production requires HTTPS.
  const crossSite = process.env.ELEEVEON_REFRESH_CROSS_SITE === '1';
  return { httpOnly: true as const, secure: process.env.NODE_ENV === 'production' || crossSite,
    sameSite: crossSite ? 'none' as const : 'lax' as const, path: '/auth' };
}
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly sessions: DurableSessionService, private readonly offlineGrants: OfflineGrantService) {}
  @Post('register') register(@Body() dto: RegisterDto) { return this.authService.register(dto); }
  @Post('login') async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    allowedOrigin(req);
    const result = await this.authService.login(dto);
    const actor = (result as any).user;
    if (!actor?.id || !actor?.accountId) throw new UnauthorizedException('Invalid authenticated user');
    const secret = await this.sessions.issue(actor.accountId, actor.id, {
      userAgent: req.headers['user-agent'], ipAddress: req.ip,
    });
    res.cookie(COOKIE, secret, cookieOptions(req));
    return result;
  }
  @Post('refresh') async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    allowedOrigin(req);
    const secret = cookieValue(req);
    if (!secret) throw new UnauthorizedException('No refresh session');
    const rotated = await this.sessions.rotate(secret);
    // A changed membership or deactivated user must not be able to renew.
    const result = await this.authService.refreshForUser(rotated.userId);
    res.cookie(COOKIE, rotated.refreshToken, cookieOptions(req));
    return result;
  }
  @Post('logout') async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    allowedOrigin(req);
    await this.sessions.revoke(cookieValue(req));
    res.clearCookie(COOKIE, cookieOptions(req));
    return { ok: true };
  }
  @UseGuards(JwtAuthGuard)
  @Post('offline-grant') offlineGrant(@Req() req: AuthenticatedRequest, @Body() body: { membershipId: string; licenseId: string; installationId: string }) {
    return this.offlineGrants.issue(req.user, body);
  }
  @UseGuards(JwtAuthGuard)
  @Get('deployment-context') deploymentContext(@Req() req: AuthenticatedRequest) { return this.authService.deploymentContext(req.user); }
  @UseGuards(JwtAuthGuard)
  @Get('me') me(@Req() req: AuthenticatedRequest) { return this.authService.me(req.user); }
}
