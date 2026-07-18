import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import {
  ConfigService,
} from "@nestjs/config";

import {
  PassportStrategy,
} from "@nestjs/passport";

import {
  ExtractJwt,
  Strategy,
} from "passport-jwt";

import {
  createHash,
} from "crypto";

import {
  PrismaService,
} from "../../prisma/prisma.service";

import type {
  AuthenticatedSessionActor,
  LightweightMembership,
} from "../auth.service";

export type JwtPayload = {
  sub?: string;
  id?: string;
  accountId?: string;
  email?: string;
  role?: string;
  membershipRevision?: string;
  permissionsRevision?: string;
  sessionRevision?: string;
  iat?: number;
  exp?: number;
};

@Injectable()
export class JwtStrategy
  extends PassportStrategy(
    Strategy,
    "jwt",
  ) {
  constructor(
    config: ConfigService,
    private readonly prisma:
      PrismaService,
  ) {
    const secret =
      config.get<string>(
        "JWT_SECRET",
      );

    if (!secret) {
      throw new Error(
        "JWT_SECRET is required.",
      );
    }

    super({
      jwtFromRequest:
        ExtractJwt
          .fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(
    payload: JwtPayload,
  ): Promise<AuthenticatedSessionActor> {
    const userId =
      String(
        payload.sub ||
          payload.id ||
          "",
      ).trim();

    const tokenAccountId =
      String(
        payload.accountId ||
          "",
      ).trim();

    if (
      !userId ||
      !tokenAccountId
    ) {
      throw new UnauthorizedException(
        "Invalid authentication token.",
      );
    }

    /**
     * One user query returns the lightweight account and active memberships.
     */
    const [
      user,
      permissionRows,
    ] = await Promise.all([
      this.prisma.appUser.findFirst({
        where: {
          id: userId,
          accountId:
            tokenAccountId,
          active: true,
        },
        include: {
          account: true,
          memberships: {
            where: {
              active: true,
            },
            orderBy: {
              createdAt:
                "asc",
            },
          },
        },
      }),

      this.prisma.permissionRule.findMany({
        where: {
          accountId:
            tokenAccountId,
        },
        orderBy: {
          moduleKey: "asc",
        },
        select: {
          id: true,
          moduleKey: true,
          moduleLabel: true,
          owner: true,
          admin: true,
          branch: true,
          teacher: true,
          student: true,
          parent: true,
          accountant: true,
          locked: true,
        },
      }),
    ]);

    if (
      !user ||
      !user.account ||
      user.account.status !==
        "active"
    ) {
      throw new UnauthorizedException(
        "This session is no longer active.",
      );
    }

    const memberships:
      LightweightMembership[] =
      user.memberships.map(
        (membership) => ({
          id:
            membership.id,
          accountId:
            membership.accountId,
          role:
            membership.role,
          schoolId:
            membership.schoolId ??
            null,
          branchId:
            membership.branchId ??
            null,
          teacherLocalId:
            membership.teacherLocalId ??
            null,
          studentLocalId:
            membership.studentLocalId ??
            null,
          parentLocalId:
            membership.parentLocalId ??
            null,
          active:
            membership.active !==
            false,
        }),
      );

    if (!memberships.length) {
      throw new UnauthorizedException(
        "No active membership is available for this session.",
      );
    }

    const membershipRevision =
      this.revisionFor(
        memberships,
      );

    const permissionsRevision =
      this.revisionFor(
        permissionRows,
      );

    const sessionRevision =
      this.revisionFor({
        userId:
          user.id,
        accountId:
          user.accountId,
        active:
          user.active,
        accountStatus:
          user.account.status,
        lastLoginAt:
          user.lastLoginAt
            ? new Date(
                user.lastLoginAt,
              ).getTime()
            : 0,
        membershipRevision,
        permissionsRevision,
      });

    return {
      id: user.id,
      accountId:
        user.accountId,
      email:
        user.email,
      phone:
        user.phone,
      role:
        user.role,
      fullName:
        user.fullName,
      active:
        user.active,
      lastLoginAt:
        user.lastLoginAt,
      account: {
        id:
          user.account.id,
        name:
          user.account.name,
        email:
          user.account.email,
        phone:
          user.account.phone,
        country:
          user.account.country,
        currency:
          user.account.currency,
        status:
          user.account.status,
      },
      memberships,
      membershipRevision,
      permissionsRevision,
      sessionRevision,
    };
  }

  private revisionFor(
    value: unknown,
  ) {
    return createHash(
      "sha256",
    )
      .update(
        JSON.stringify(value),
      )
      .digest("hex")
      .slice(0, 24);
  }
}