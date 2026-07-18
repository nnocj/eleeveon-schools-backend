import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Socket } from "socket.io";

export type RealtimeAuthenticatedUser = {
  id: string;
  accountId: string;
  email?: string;
  role?: string;
  fullName?: string;
};

@Injectable()
export class RealtimeAuthGuard {
  constructor(private readonly jwtService: JwtService) {}

  async authenticate(client: Socket): Promise<RealtimeAuthenticatedUser> {
    const token = this.extractToken(client);

    if (!token) {
      throw new UnauthorizedException("Realtime access token is missing.");
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException("Realtime JWT configuration is missing.");
    }

    let payload: any;

    try {
      payload = await this.jwtService.verifyAsync(token, { secret });
    } catch {
      throw new UnauthorizedException("Realtime access token is invalid or expired.");
    }

    const id = String(payload?.id || payload?.sub || "").trim();
    const accountId = String(payload?.accountId || "").trim();

    if (!id || !accountId) {
      throw new UnauthorizedException("Realtime token has no account scope.");
    }

    return {
      id,
      accountId,
      email: payload?.email,
      role: payload?.role,
      fullName: payload?.fullName,
    };
  }

  private extractToken(client: Socket) {
    const authToken = client.handshake.auth?.token;
    const queryToken = client.handshake.query?.token;
    const authorization = client.handshake.headers.authorization;

    const candidate =
      (Array.isArray(authToken) ? authToken[0] : authToken) ||
      (Array.isArray(queryToken) ? queryToken[0] : queryToken) ||
      authorization;

    const clean = String(candidate || "").trim();
    return clean.replace(/^Bearer\s+/i, "").trim() || null;
  }
}