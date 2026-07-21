import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createHash } from "crypto";
import * as bcrypt from "bcryptjs";

import { PrismaService } from "../prisma/prisma.service";
import {
  LoginDto,
  RegisterDto,
} from "./dto/auth.dto";


export type LightweightMembership = {
  id: string;
  accountId: string;
  role: string;

  schoolId: string | null;
  branchId: string | null;

  teacherId: string | null;
  studentId: string | null;
  parentId: string | null;

  active: boolean;
};

export type AuthenticatedSessionActor = {
  id: string;
  accountId: string;
  email: string;
  phone?: string | null;
  role: string;
  fullName: string;
  active?: boolean;
  lastLoginAt?: Date | string | null;
  account: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    country?: string | null;
    currency?: string | null;
    status: string;
  };
  memberships: LightweightMembership[];
  membershipRevision: string;
  permissionsRevision: string;
  sessionRevision: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private jwtSecret() {
    const secret =
      this.config.get<string>("JWT_SECRET");

    if (!secret) {
      throw new Error(
        "JWT_SECRET is required.",
      );
    }

    return secret;
  }

  async register(dto: RegisterDto) {
    const email =
      dto.email.toLowerCase().trim();

    const existing =
      await this.prisma.appUser.findUnique({
        where: { email },
        select: { id: true },
      });

    if (existing) {
      throw new BadRequestException(
        "This email is already registered.",
      );
    }

    const passwordHash =
      await bcrypt.hash(
        dto.password,
        12,
      );

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          const account =
            await tx.account.create({
              data: {
                name:
                  dto.accountName.trim(),
                email,
                phone:
                  dto.phone?.trim() ||
                  null,
                country: "GH",
                currency: "GHS",
                status: "active",
              },
            });

          const trialPlan =
            await tx.subscriptionPlan.findUnique({
              where: {
                code: "trial",
              },
            });

          if (trialPlan) {
            const now =
              new Date();

            const trialEndsAt =
              new Date(
                now.getTime() +
                  14 *
                    24 *
                    60 *
                    60 *
                    1000,
              );

            await tx.accountSubscription.create({
              data: {
                accountId:
                  account.id,
                planId:
                  trialPlan.id,
                status: "trial",
                billingCycle:
                  "monthly",
                trialStartedAt:
                  now,
                trialEndsAt,
                currentPeriodStart:
                  now,
                currentPeriodEnd:
                  trialEndsAt,
                nextBillingDate:
                  trialEndsAt,
              },
            });
          }

          const user =
            await tx.appUser.create({
              data: {
                accountId:
                  account.id,
                fullName:
                  dto.fullName.trim(),
                email,
                phone:
                  dto.phone?.trim() ||
                  null,
                passwordHash,
                role:
                  "super_admin",
                active: true,
              },
            });

          const membership =
            await tx.userMembership.create({
              data: {
                accountId:
                  account.id,
                userId: user.id,
                role:
                  "super_admin",

                // Stable account-level membership identity required by Prisma.
                // This remains deterministic if the registration request is retried.
                scopeKey:
                  `super_admin:account:${account.id}`,

                active: true,
                isDefault: true,
                status: "active",
              },
            });

          /**
           * Verify that the newly-created account is visible inside the same
           * interactive transaction before inserting account-owned defaults.
           */
          const accountInsideTransaction =
            await tx.account.findUnique({
              where: {
                id: account.id,
              },
              select: {
                id: true,
              },
            });

          if (!accountInsideTransaction) {
            throw new Error(
              `Account ${account.id} was created but is not visible inside the registration transaction.`,
            );
          }

          await this.seedDefaultPermissionRules(
            tx,
            account.id,
          );

          return {
            user,
            account,
            memberships: [
              membership,
            ],
          };
        },
      );

    const permissionRows =
      await this.loadPermissionRevisionRows(
        result.account.id,
      );

    return this.buildSessionFromLoadedUser(
      {
        ...result.user,
        account:
          result.account,
        memberships:
          result.memberships,
      },
      permissionRows,
      true,
    );
  }

  async login(dto: LoginDto) {
    const email =
      dto.email.toLowerCase().trim();

    /**
     * One user query returns:
     * - password hash;
     * - lightweight account;
     * - all active memberships.
     *
     * The same loaded result is used to build the response. Login does not
     * call sessionForUser() and therefore does not query the user twice.
     */
    const user =
      await this.prisma.appUser.findUnique({
        where: { email },
        include: {
          account: true,
          memberships: {
            where: {
              active: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

    if (
      !user ||
      !user.active ||
      !user.account ||
      user.account.status !==
        "active"
    ) {
      throw new UnauthorizedException(
        "Invalid login credentials.",
      );
    }

    const ok =
      await bcrypt.compare(
        dto.password,
        user.passwordHash,
      );

    if (!ok) {
      throw new UnauthorizedException(
        "Invalid login credentials.",
      );
    }

    if (!user.memberships.length) {
      throw new UnauthorizedException(
        "No active membership is available.",
      );
    }

    const lastLoginAt =
      new Date();

    const [
      permissionRows,
    ] = await Promise.all([
      this.loadPermissionRevisionRows(
        user.accountId,
      ),

      /**
       * This write is deliberately not followed by another user read.
       */
      this.prisma.appUser.update({
        where: {
          id: user.id,
        },
        data: {
          lastLoginAt,
        },
        select: {
          id: true,
        },
      }),
    ]);

    return this.buildSessionFromLoadedUser(
      {
        ...user,
        lastLoginAt,
      },
      permissionRows,
      true,
    );
  }

  /**
   * JwtStrategy has already loaded and validated the session user, account,
   * memberships, and revisions. /auth/me simply serializes that actor.
   */
  async me(
    actor: AuthenticatedSessionActor,
  ) {
    if (
      !actor ||
      !actor.id ||
      !actor.accountId ||
      !actor.account ||
      !actor.memberships?.length
    ) {
      throw new UnauthorizedException(
        "Your session is no longer active.",
      );
    }

    return this.serializeSession(
      actor,
      false,
    );
  }

  private async buildSessionFromLoadedUser(
    loaded: any,
    permissionRows: any[],
    includeToken: boolean,
  ) {
    if (
      !loaded ||
      !loaded.active ||
      !loaded.account ||
      loaded.account.status !==
        "active"
    ) {
      throw new UnauthorizedException(
        "Your account is not active.",
      );
    }

    const memberships =
      this.mapMemberships(
        loaded.memberships || [],
      );

    if (!memberships.length) {
      throw new UnauthorizedException(
        "No active membership is available.",
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
        userId: loaded.id,
        accountId:
          loaded.accountId,
        active:
          loaded.active,
        accountStatus:
          loaded.account.status,
        lastLoginAt:
          loaded.lastLoginAt
            ? new Date(
                loaded.lastLoginAt,
              ).getTime()
            : 0,
        membershipRevision,
        permissionsRevision,
      });

    const actor:
      AuthenticatedSessionActor = {
      id: loaded.id,
      accountId:
        loaded.accountId,
      email:
        loaded.email,
      phone:
        loaded.phone,
      role:
        loaded.role,
      fullName:
        loaded.fullName,
      active:
        loaded.active,
      lastLoginAt:
        loaded.lastLoginAt,
      account: {
        id:
          loaded.account.id,
        name:
          loaded.account.name,
        email:
          loaded.account.email,
        phone:
          loaded.account.phone,
        country:
          loaded.account.country,
        currency:
          loaded.account.currency,
        status:
          loaded.account.status,
      },
      memberships,
      membershipRevision,
      permissionsRevision,
      sessionRevision,
    };

    return this.serializeSession(
      actor,
      includeToken,
    );
  }

  private async serializeSession(
    actor: AuthenticatedSessionActor,
    includeToken: boolean,
  ) {
    const payload = {
      sub: actor.id,
      id: actor.id,
      accountId:
        actor.accountId,
      email:
        actor.email,
      role:
        actor.role,
      membershipRevision:
        actor.membershipRevision,
      permissionsRevision:
        actor.permissionsRevision,
      sessionRevision:
        actor.sessionRevision,
    };

    return {
      user: {
        id: actor.id,
        accountId:
          actor.accountId,
        fullName:
          actor.fullName,
        email:
          actor.email,
        phone:
          actor.phone || null,
        role:
          actor.role,
        active:
          actor.active !== false,
        lastLoginAt:
          actor.lastLoginAt || null,
        memberships:
          actor.memberships,
        membershipRevision:
          actor.membershipRevision,
        permissionsRevision:
          actor.permissionsRevision,
        sessionRevision:
          actor.sessionRevision,
      },

      memberships:
        actor.memberships,

      account:
        actor.account,

      membershipRevision:
        actor.membershipRevision,

      permissionsRevision:
        actor.permissionsRevision,

      sessionRevision:
        actor.sessionRevision,

      ...(includeToken
        ? {
            accessToken:
              await this.jwt.signAsync(
                payload,
                {
                  secret:
                    this.jwtSecret(),
                  expiresIn:
                    "30d",
                },
              ),
          }
        : {}),
    };
  }

  private mapMemberships(
    memberships: any[],
  ): LightweightMembership[] {
    return memberships
      .filter(
        (membership) =>
          membership.active !==
          false,
      )
      .map(
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
        }),
      );
  }

  private async loadPermissionRevisionRows(
    accountId: string,
  ) {
    return this.prisma.permissionRule.findMany({
      where: {
        accountId,
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
    });
  }

  private revisionFor(
    value: unknown,
  ) {
    return createHash("sha256")
      .update(
        JSON.stringify(value),
      )
      .digest("hex")
      .slice(0, 24);
  }

  private async seedDefaultPermissionRules(
    tx: any,
    accountId: string,
  ): Promise<void> {
    const modules = [
      {
        moduleKey: "schools",
        moduleLabel: "Schools",
        owner: "yes",
        admin: "yes",
        branch: "no",
        teacher: "no",
        student: "no",
        parent: "no",
        accountant: "no",
      },
      {
        moduleKey: "branches",
        moduleLabel: "Branches",
        owner: "yes",
        admin: "yes",
        branch: "yes",
        teacher: "no",
        student: "no",
        parent: "no",
        accountant: "no",
      },
      {
        moduleKey: "users",
        moduleLabel: "Users & Memberships",
        owner: "yes",
        admin: "yes",
        branch: "yes",
        teacher: "no",
        student: "no",
        parent: "no",
        accountant: "no",
      },
      {
        moduleKey: "academics",
        moduleLabel: "Academic Setup",
        owner: "yes",
        admin: "yes",
        branch: "yes",
        teacher: "no",
        student: "no",
        parent: "no",
        accountant: "no",
      },
      {
        moduleKey: "attendance",
        moduleLabel: "Attendance",
        owner: "yes",
        admin: "yes",
        branch: "yes",
        teacher: "yes",
        student: "yes",
        parent: "yes",
        accountant: "no",
      },
      {
        moduleKey: "assessment",
        moduleLabel: "Assessment",
        owner: "yes",
        admin: "yes",
        branch: "yes",
        teacher: "yes",
        student: "yes",
        parent: "yes",
        accountant: "no",
      },
      {
        moduleKey: "reports",
        moduleLabel: "Reports",
        owner: "yes",
        admin: "yes",
        branch: "yes",
        teacher: "yes",
        student: "yes",
        parent: "yes",
        accountant: "yes",
      },
      {
        moduleKey: "finance",
        moduleLabel: "Finance",
        owner: "yes",
        admin: "yes",
        branch: "yes",
        teacher: "no",
        student: "no",
        parent: "yes",
        accountant: "yes",
      },
      {
        moduleKey: "settings",
        moduleLabel: "Settings",
        owner: "yes",
        admin: "yes",
        branch: "yes",
        teacher: "no",
        student: "no",
        parent: "no",
        accountant: "no",
      },
    ];

    await tx.permissionRule.createMany({
      data: modules.map((module) => ({
        accountId,
        ...module,
      })),
      skipDuplicates: true,
    });
  }
}
