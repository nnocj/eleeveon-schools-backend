import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createHash } from "crypto";
import * as bcrypt from "bcryptjs";

import type {
  AppRole,
} from "../common/roles";
import {
  normalizeRole,
} from "../common/roles";
import { PrismaService } from "../prisma/prisma.service";
import {
  LoginDto,
  RegisterDto,
} from "./dto/auth.dto";

export type LightweightMembership = {
  id: string;
  accountId: string;
  role: AppRole;

  schoolId: string | null;
  branchId: string | null;

  teacherId: string | null;
  studentId: string | null;
  parentId: string | null;

  active: boolean;
  status: string | null;
  isDefault: boolean;
};

export type AuthenticatedSessionActor = {
  id: string;
  accountId: string;
  email: string;
  phone?: string | null;

  /**
   * Backward-compatible account fallback role.
   * Multi-role authorization should also inspect `memberships`.
   */
  role: AppRole;

  fullName: string;
  active?: boolean;
  lastLoginAt?: Date | string | null;

  activeMembershipId?: string | null;
  activeRole?: AppRole | null;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;

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

  private jwtSecret(): string {
    const secret =
      this.config.get<string>("JWT_SECRET");

    if (!secret) {
      throw new Error(
        "JWT_SECRET is required.",
      );
    }

    return secret;
  }

  private requireRole(
    role: string | null | undefined,
    message = "Invalid or unsupported user role.",
  ): AppRole {
    const normalized =
      normalizeRole(role);

    if (!normalized) {
      throw new UnauthorizedException(
        message,
      );
    }

    return normalized;
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
                scopeKey:
                  `super_admin:account:${account.id}`,
                active: true,
                isDefault: true,
                status: "active",
              },
            });

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

    const user =
      await this.prisma.appUser.findUnique({
        where: { email },
        include: {
          account: true,
          memberships: {
            where: {
              active: true,
              status: "active",
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

    const fallbackRole =
      this.requireRole(
        loaded.role,
        "The account user has an invalid role.",
      );

    /*
     * A default membership provides initial workspace context only.
     * The frontend may still let the user choose another membership and
     * persist that choice through the dedicated workspace/session flow.
     */
    const defaultMembership =
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
          loaded.id,
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
        activeMembershipId:
          defaultMembership?.id ||
          null,
        membershipRevision,
        permissionsRevision,
      });

    const actor:
      AuthenticatedSessionActor = {
      id:
        loaded.id,
      accountId:
        loaded.accountId,
      email:
        loaded.email,
      phone:
        loaded.phone,
      role:
        fallbackRole,
      fullName:
        loaded.fullName,
      active:
        loaded.active,
      lastLoginAt:
        loaded.lastLoginAt,

      activeMembershipId:
        defaultMembership?.id ||
        null,
      activeRole:
        defaultMembership?.role ||
        null,
      schoolId:
        defaultMembership?.schoolId ??
        null,
      branchId:
        defaultMembership?.branchId ??
        null,
      teacherId:
        defaultMembership?.teacherId ??
        null,
      studentId:
        defaultMembership?.studentId ??
        null,
      parentId:
        defaultMembership?.parentId ??
        null,

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
      sub:
        actor.id,
      id:
        actor.id,
      accountId:
        actor.accountId,
      email:
        actor.email,

      /*
       * Keep the fallback AppUser role for compatibility, while also carrying
       * explicit membership context for membership-aware authorization.
       */
      role:
        actor.role,
      activeMembershipId:
        actor.activeMembershipId ||
        null,
      activeRole:
        actor.activeRole ||
        null,
      schoolId:
        actor.schoolId ||
        null,
      branchId:
        actor.branchId ||
        null,
      teacherId:
        actor.teacherId ||
        null,
      studentId:
        actor.studentId ||
        null,
      parentId:
        actor.parentId ||
        null,

      membershipRevision:
        actor.membershipRevision,
      permissionsRevision:
        actor.permissionsRevision,
      sessionRevision:
        actor.sessionRevision,
    };

    return {
      user: {
        id:
          actor.id,
        accountId:
          actor.accountId,
        fullName:
          actor.fullName,
        email:
          actor.email,
        phone:
          actor.phone ||
          null,
        role:
          actor.role,
        active:
          actor.active !==
          false,
        lastLoginAt:
          actor.lastLoginAt ||
          null,

        activeMembershipId:
          actor.activeMembershipId ||
          null,
        activeRole:
          actor.activeRole ||
          null,
        schoolId:
          actor.schoolId ||
          null,
        branchId:
          actor.branchId ||
          null,
        teacherId:
          actor.teacherId ||
          null,
        studentId:
          actor.studentId ||
          null,
        parentId:
          actor.parentId ||
          null,

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

      activeMembershipId:
        actor.activeMembershipId ||
        null,
      activeRole:
        actor.activeRole ||
        null,

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
            false &&
          membership.status !==
            "suspended" &&
          membership.status !==
            "revoked" &&
          membership.status !==
            "expired",
      )
      .map(
        (membership) => {
          const role =
            this.requireRole(
              membership.role,
              `Membership ${membership.id || ""} has an invalid role.`,
            );

          return {
            id:
              String(
                membership.id,
              ),
            accountId:
              String(
                membership.accountId,
              ),
            role,
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
  }

  private async loadPermissionRevisionRows(
    accountId: string,
  ) {
    return this.prisma.permissionRule.findMany({
      where: {
        accountId,
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
    });
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

  private async seedDefaultPermissionRules(
    tx: any,
    accountId: string,
  ): Promise<void> {
    const modules = [
      {
        moduleKey:
          "schools",
        moduleLabel:
          "Schools",
        owner:
          "yes",
        admin:
          "yes",
        branch:
          "no",
        teacher:
          "no",
        student:
          "no",
        parent:
          "no",
        accountant:
          "no",
      },
      {
        moduleKey:
          "branches",
        moduleLabel:
          "Branches",
        owner:
          "yes",
        admin:
          "yes",
        branch:
          "yes",
        teacher:
          "no",
        student:
          "no",
        parent:
          "no",
        accountant:
          "no",
      },
      {
        moduleKey:
          "users",
        moduleLabel:
          "Users & Memberships",
        owner:
          "yes",
        admin:
          "yes",
        branch:
          "yes",
        teacher:
          "no",
        student:
          "no",
        parent:
          "no",
        accountant:
          "no",
      },
      {
        moduleKey:
          "academics",
        moduleLabel:
          "Academic Setup",
        owner:
          "yes",
        admin:
          "yes",
        branch:
          "yes",
        teacher:
          "no",
        student:
          "no",
        parent:
          "no",
        accountant:
          "no",
      },
      {
        moduleKey:
          "attendance",
        moduleLabel:
          "Attendance",
        owner:
          "yes",
        admin:
          "yes",
        branch:
          "yes",
        teacher:
          "yes",
        student:
          "yes",
        parent:
          "yes",
        accountant:
          "no",
      },
      {
        moduleKey:
          "assessment",
        moduleLabel:
          "Assessment",
        owner:
          "yes",
        admin:
          "yes",
        branch:
          "yes",
        teacher:
          "yes",
        student:
          "yes",
        parent:
          "yes",
        accountant:
          "no",
      },
      {
        moduleKey:
          "reports",
        moduleLabel:
          "Reports",
        owner:
          "yes",
        admin:
          "yes",
        branch:
          "yes",
        teacher:
          "yes",
        student:
          "yes",
        parent:
          "yes",
        accountant:
          "yes",
      },
      {
        moduleKey:
          "finance",
        moduleLabel:
          "Finance",
        owner:
          "yes",
        admin:
          "yes",
        branch:
          "yes",
        teacher:
          "no",
        student:
          "no",
        parent:
          "yes",
        accountant:
          "yes",
      },
      {
        moduleKey:
          "settings",
        moduleLabel:
          "Settings",
        owner:
          "yes",
        admin:
          "yes",
        branch:
          "yes",
        teacher:
          "no",
        student:
          "no",
        parent:
          "no",
        accountant:
          "no",
      },
    ];


    await tx.permissionRule.createMany({
      data:
        modules.map(
          (module) => ({
            accountId,
            ...module,
          }),
        ),
      skipDuplicates:
        true,
    });
  }
}