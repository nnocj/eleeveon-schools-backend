/**
 * src/auth/jwt-auth.guard.ts
 * --------------------------------------------------------------------------
 * Passport JWT authentication guard.
 *
 * Important:
 * - delegates token extraction and verification to JwtStrategy;
 * - JwtStrategy validates the database user, account and active memberships;
 * - req.user receives the complete AuthenticatedSessionActor;
 * - does not manually decode or verify the token.
 */

import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import {
  AuthGuard,
} from "@nestjs/passport";

@Injectable()
export class JwtAuthGuard extends AuthGuard(
  "jwt",
) {
  handleRequest<TUser = any>(
    error: any,
    user: TUser,
    info: any,
    context: ExecutionContext,
  ): TUser {
    if (error) {
      throw error;
    }

    if (!user) {
      const message =
        info?.name ===
        "TokenExpiredError"
          ? "Your session has expired. Please sign in again."
          : info?.message ||
            "Your session is invalid or no longer active.";

      throw new UnauthorizedException(
        message,
      );
    }

    return user;
  }
}