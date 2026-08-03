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

import type {
  AppRole,
} from "../../common/roles";
import {
  normalizeRole,
} from "../../common/roles";

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

  /**
   * Backward-compatible account fallback role.
   */
  role?: string;

  /**
   * Explicit selected workspace context.
   */
  activeMembershipId?: string | null;
  activeRole?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;

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
      ignoreExpiration:
        false,
      secretOrKey:
        secret,
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

    const [
      user,
      permissionRows,
    ] = await Promise.all([
      this.prisma.appUser.findFirst({
        where: {
          id:
            userId,
          accountId:
            tokenAccountId,
          active:
            true,
        },
        include: {
          account:
            true,
          memberships: {
            where: {
              active:
                true,
              status: {
                notIn: [
                  "suspended",
                  "revoked",
                  "expired",
                ],
              },
            },
            orderBy: [
              {
                isDefault:
                  "desc",
              },
              {
                createdAt:
                  "asc",
              },
            ],
          },
        },
      }),

      this.prisma.permissionRule.findMany({
        where: {
          accountId:
            tokenAccountId,
        },
        orderBy: {
          moduleKey:
            "asc",
        },
        select: {
          id:
            true,
          moduleKey:
            true,
          moduleLabel:
            true,
          owner:
            true,
          admin:
            true,
          branch:
            true,
          teacher:
            true,
          student:
            true,
          parent:
            true,
          accountant:
            true,
          locked:
            true,
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
        (membership) => {
          const normalizedRole =
            normalizeRole(
              membership.role,
            );

          if (!normalizedRole) {
            throw new UnauthorizedException(
              `Membership ${membership.id} has an invalid role.`,
            );
          }

          return {
            id:
              membership.id,
            accountId:
              membership.accountId,
            role:
              normalizedRole,
            schoolId:
              membership.schoolId ??
              null,
            branchId:
              membership.branchId ??
              null,
            teacherId:
              membership.teacherId ??
              null,
            studentId:
              membership.studentId ??
              null,
            parentId:
              membership.parentId ??
              null,
            active:
              membership.active !==
              false,
            status:
              membership.status ??
              null,
            isDefault:
              membership.isDefault ===
              true,
          };
        },
      );

    if (!memberships.length) {
      throw new UnauthorizedException(
        "No active membership is available for this session.",
      );
    }

    const fallbackRole =
      this.requireRole(
        user.role,
        "The account user has an invalid role.",
      );

    const requestedMembershipId =
      String(
        payload.activeMembershipId ||
          "",
      ).trim();

    const requestedRole =
      normalizeRole(
        payload.activeRole,
      );

    /*
     * Resolve the selected membership in priority order:
     * 1. explicit activeMembershipId from the JWT;
     * 2. role + scope carried by the JWT;
     * 3. default membership;
     * 4. membership matching the AppUser fallback role;
     * 5. first active membership.
     */
    const activeMembership =
      (requestedMembershipId
        ? memberships.find(
            (membership) =>
              membership.id ===
              requestedMembershipId,
          )
        : undefined) ||
      memberships.find(
        (membership) =>
          Boolean(
            requestedRole &&
              membership.role ===
                requestedRole &&
              this.sameOptionalId(
                membership.schoolId,
                payload.schoolId,
              ) &&
              this.sameOptionalId(
                membership.branchId,
                payload.branchId,
              ) &&
              this.sameOptionalId(
                membership.teacherId,
                payload.teacherId,
              ) &&
              this.sameOptionalId(
                membership.studentId,
                payload.studentId,
              ) &&
              this.sameOptionalId(
                membership.parentId,
                payload.parentId,
              ),
          ),
      ) ||
      memberships.find(
        (membership) =>
          membership.isDefault,
      ) ||
      memberships.find(
        (membership) =>
          membership.role ===
          fallbackRole,
      ) ||
      memberships[0];

    if (!activeMembership) {
      throw new UnauthorizedException(
        "The selected membership is no longer active.",
      );
    }

    /*
     * If the token explicitly names a membership that no longer exists or is
     * inactive, reject the session rather than silently switching roles.
     */
    if (
      requestedMembershipId &&
      activeMembership.id !==
        requestedMembershipId
    ) {
      throw new UnauthorizedException(
        "The selected membership is no longer active.",
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
        activeMembershipId:
          activeMembership.id,
        membershipRevision,
        permissionsRevision,
      });

    return {
      id:
        user.id,
      accountId:
        user.accountId,
      email:
        user.email,
      phone:
        user.phone,

      /*
       * The effective request role now comes from the selected membership.
       * This is the critical multi-role fix.
       */
      role:
        activeMembership.role,

      fullName:
        user.fullName,
      active:
        user.active,
      lastLoginAt:
        user.lastLoginAt,

      activeMembershipId:
        activeMembership.id,
      activeRole:
        activeMembership.role,
      schoolId:
        activeMembership.schoolId,
      branchId:
        activeMembership.branchId,
      teacherId:
        activeMembership.teacherId,
      studentId:
        activeMembership.studentId,
      parentId:
        activeMembership.parentId,

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

  private requireRole(
    role: string | null | undefined,
    message: string,
  ): AppRole {
    const normalized =
      normalizeRole(
        role,
      );

    if (!normalized) {
      throw new UnauthorizedException(
        message,
      );
    }

    return normalized;
  }

  private sameOptionalId(
    actual:
      | string
      | null
      | undefined,
    expected:
      | string
      | null
      | undefined,
  ): boolean {
    const expectedValue =
      String(
        expected ??
          "",
      ).trim();

    if (!expectedValue) {
      return true;
    }

    return (
      String(
        actual ??
          "",
      ).trim() ===
      expectedValue
    );
  }

  private revisionFor(
    value: unknown,
  ): string {
    return createHash(
      "sha256",
    )
      .update(
        JSON.stringify(
          value,
        ),
      )
      .digest(
        "hex",
      )
      .slice(
        0,
        24,
      );
  }
}