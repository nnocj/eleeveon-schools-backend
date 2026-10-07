import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { AuthUser } from "../common/auth-user";
import { assertSameAccountOrDeveloper } from "../common/scope";
import { isDeveloper, normalizeRole } from "../common/roles";
import {
  ChangeMyEmailDto,
  ChangeMyPasswordDto,
  CreateAccountDto,
  CreateAccountUserDto,
  UpdateAccountDto,
  UpdateAccountSettingsDto,
  UpdateAccountUserDto,
  UpdateAccountUserStatusDto,
  UpdateMyProfileDto,
} from "./dto/account-users.dto";

const USER_CREATION_ROLES = new Set([
  "developer",
  "platform_team",
  "owner",
  "super_admin",
  "school_admin",
  "admin",
  "branch_admin",
]);

const ACCOUNT_USER_MANAGEMENT_ROLES = new Set([
  "developer",
  "platform_team",
  "owner",
  "super_admin",
  "school_admin",
  "admin",
]);

const OWNER_ONLY_ROLES = new Set([
  "developer",
  "platform_team",
  "owner",
  "super_admin",
]);

const BRANCH_ASSIGNABLE_ROLES = new Set([
  "accountant",
  "teacher",
  "student",
  "parent",
]);

/**
 * Produces a stable identity for a membership scope.
 *
 * The key includes the role and every applicable permanent backend ID so that:
 * - account-wide roles remain unique per account;
 * - school/branch roles remain unique per assigned scope;
 * - teacher/student/parent profiles do not collide.
 */
function buildMembershipScopeKey(input: {
  accountId: string;
  role: string;
  schoolId?: string | null;
  branchId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
}): string {
  return [
    input.role,
    `account:${input.accountId}`,
    input.schoolId ? `school:${input.schoolId}` : null,
    input.branchId ? `branch:${input.branchId}` : null,
    input.teacherId ? `teacher:${input.teacherId}` : null,
    input.studentId ? `student:${input.studentId}` : null,
    input.parentId ? `parent:${input.parentId}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join("|");
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  private normalizedActorRole(role: string): string {
    const normalized = normalizeRole(role);

    if (!normalized) {
      throw new ForbiddenException(
        "Invalid or unsupported user role.",
      );
    }

    return normalized === "admin"
      ? "school_admin"
      : normalized;
  }

  private assertCanCreateUsers(role: string) {
    const normalizedRole = this.normalizedActorRole(role);
    if (!USER_CREATION_ROLES.has(normalizedRole)) {
      throw new ForbiddenException(
        "You do not have permission to create account users.",
      );
    }
  }

  private assertCanManageAccountUsers(role: string) {
    const normalizedRole = this.normalizedActorRole(role);
    if (!ACCOUNT_USER_MANAGEMENT_ROLES.has(normalizedRole)) {
      throw new ForbiddenException(
        "You do not have permission to manage account users.",
      );
    }
  }

  private assertCanManageOwnerOnly(role: string) {
    if (!OWNER_ONLY_ROLES.has(role)) {
      throw new ForbiddenException("Only the owner can perform this action.");
    }
  }

  async getMyProfile(actor: AuthUser) {
    const user = await this.prisma.appUser.findUnique({
      where: { id: actor.id },
      select: {
        id: true,
        accountId: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        preferredLocale: true,
        active: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        passwordChangedAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        memberships: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!user) throw new NotFoundException("Current user not found.");
    assertSameAccountOrDeveloper(actor, user.accountId);

    const account = await this.prisma.account.findUnique({
      where: { id: user.accountId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        website: true,
        address: true,
        description: true,
        logoMediaId: true,
        photoMediaId: true,
        bannerMediaId: true,
        country: true,
        currency: true,
        defaultLocale: true,
        timeZone: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!account) throw new NotFoundException("Account not found.");
    return { user, account };
  }

  async updateMyProfile(actor: AuthUser, dto: UpdateMyProfileDto) {
    const existing = await this.prisma.appUser.findUnique({
      where: { id: actor.id },
      select: { id: true, accountId: true, active: true },
    });
    if (!existing) throw new NotFoundException("Current user not found.");
    assertSameAccountOrDeveloper(actor, existing.accountId);

    const user = await this.prisma.appUser.update({
      where: { id: existing.id },
      data: {
        fullName: dto.fullName !== undefined ? dto.fullName.trim() : undefined,
        phone: dto.phone !== undefined ? dto.phone.trim() || null : undefined,
        preferredLocale: dto.preferredLocale !== undefined ? dto.preferredLocale.trim() || null : undefined,
      },
      select: {
        id: true,
        accountId: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        preferredLocale: true,
        active: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        passwordChangedAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        memberships: true,
      },
    });

    this.realtime.emitMembershipsChanged({
      accountId: user.accountId,
      userId: user.id,
      action: "updated",
      active: user.active !== false,
      metadata: { operation: "self-profile-updated" },
    });
    return user;
  }

  async changeMyEmail(actor: AuthUser, dto: ChangeMyEmailDto) {
    const existing = await this.prisma.appUser.findUnique({ where: { id: actor.id } });
    if (!existing) throw new NotFoundException("Current user not found.");
    assertSameAccountOrDeveloper(actor, existing.accountId);

    const passwordMatches = await bcrypt.compare(dto.currentPassword, existing.passwordHash);
    if (!passwordMatches) throw new BadRequestException("Current password is incorrect.");

    const newEmail = dto.newEmail.toLowerCase().trim();
    if (!newEmail) throw new BadRequestException("New email is required.");

    const duplicate = await this.prisma.appUser.findUnique({
      where: { email: newEmail },
      select: { id: true },
    });
    if (duplicate && duplicate.id !== existing.id) {
      throw new BadRequestException("This email is already registered.");
    }

    if (newEmail === existing.email.toLowerCase()) {
      return this.prisma.appUser.findUnique({
        where: { id: existing.id },
        select: {
          id: true,
          accountId: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          preferredLocale: true,
          active: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          passwordChangedAt: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          memberships: true,
        },
      });
    }

    const user = await this.prisma.appUser.update({
      where: { id: existing.id },
      data: { email: newEmail, emailVerifiedAt: null },
      select: {
        id: true,
        accountId: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        preferredLocale: true,
        active: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        passwordChangedAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        memberships: true,
      },
    });

    this.realtime.emitMembershipsChanged({
      accountId: user.accountId,
      userId: user.id,
      action: "updated",
      active: user.active !== false,
      metadata: { operation: "self-email-changed" },
    });
    return user;
  }

  async changeMyPassword(actor: AuthUser, dto: ChangeMyPasswordDto) {
    const existing = await this.prisma.appUser.findUnique({ where: { id: actor.id } });
    if (!existing) throw new NotFoundException("Current user not found.");
    assertSameAccountOrDeveloper(actor, existing.accountId);

    const passwordMatches = await bcrypt.compare(dto.currentPassword, existing.passwordHash);
    if (!passwordMatches) throw new BadRequestException("Current password is incorrect.");

    const sameAsCurrent = await bcrypt.compare(dto.newPassword, existing.passwordHash);
    if (sameAsCurrent) throw new BadRequestException("New password must be different from the current password.");

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    const user = await this.prisma.appUser.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
      select: {
        id: true,
        accountId: true,
        email: true,
        role: true,
        active: true,
        passwordChangedAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      userId: user.id,
      email: user.email,
      passwordChangedAt: user.passwordChangedAt,
      updatedAt: user.updatedAt,
    };
  }

  async getAccountSettings(actor: AuthUser) {
    const account = await this.prisma.account.findUnique({
      where: { id: actor.accountId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException("Account not found.");

    return this.prisma.accountSystemSetting.findMany({
      where: { accountId: actor.accountId },
      orderBy: { key: "asc" },
    });
  }

  async updateAccountSettings(actor: AuthUser, dto: UpdateAccountSettingsDto) {
    this.assertCanManageOwnerOnly(actor.role);
    const entries = Object.entries(dto).filter(([, value]) => value !== undefined);
    if (!entries.length) return this.getAccountSettings(actor);

    const keys = entries.map(([key]) => key);
    const locked = await this.prisma.accountSystemSetting.findMany({
      where: {
        accountId: actor.accountId,
        key: { in: keys },
        locked: true,
      },
      select: { key: true },
    });
    if (locked.length) {
      throw new BadRequestException(
        `These account settings are locked: ${locked.map((row) => row.key).join(", ")}.`,
      );
    }

    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.accountSystemSetting.upsert({
          where: {
            accountId_key: { accountId: actor.accountId, key },
          },
          update: { value: value as any },
          create: { accountId: actor.accountId, key, value: value as any },
        }),
      ),
    );

    this.realtime.emitAccountDataChanged({
      accountId: actor.accountId,
      changedTables: ["accountSystemSettings"],
      metadata: { action: "account-settings-updated", keys },
    });
    return this.getAccountSettings(actor);
  }

  async listAccounts(actor: AuthUser, q?: string) {
    if (!isDeveloper(actor.role)) throw new ForbiddenException("Only developer can list platform accounts.");
    return this.prisma.account.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {},
      include: { subscription: { include: { plan: true } }, _count: { select: { users: true, memberships: true, records: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async createAccount(actor: AuthUser, dto: CreateAccountDto) {
    if (!isDeveloper(actor.role)) throw new ForbiddenException("Only developer can create platform accounts directly.");
    const account = await this.prisma.account.create({
      data: {
        name: dto.name.trim(),
        email: dto.email?.toLowerCase().trim() || null,
        phone: dto.phone?.trim() || null,
        country: dto.country || "GH",
        currency: dto.currency || "GHS",
      },
    });

    this.realtime.emitAccountDataChanged({
      accountId: account.id,
      changedTables: ["accounts"],
      metadata: { action: "account-created" },
    });

    return account;
  }

  async getAccount(actor: AuthUser, accountId?: string) {
    const id = accountId || actor.accountId;
    assertSameAccountOrDeveloper(actor, id);
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        users: { select: { id: true, fullName: true, email: true, phone: true, role: true, active: true, lastLoginAt: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        invoices: { orderBy: { createdAt: "desc" }, take: 10 },
        payments: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!account) throw new NotFoundException("Account not found");
    return account;
  }

  async updateAccount(actor: AuthUser, accountId: string, dto: UpdateAccountDto) {
    assertSameAccountOrDeveloper(actor, accountId);
    if (dto.status && !isDeveloper(actor.role)) {
      throw new ForbiddenException("Only developer can change account status.");
    }
    const account = await this.prisma.account.update({ where: { id: accountId }, data: dto });
    this.realtime.emitAccountDataChanged({
      accountId,
      changedTables: ["accounts"],
      metadata: { action: "account-updated" },
    });
    return account;
  }

  async closeAccount(actor: AuthUser, accountId: string) {
    if (!isDeveloper(actor.role)) throw new ForbiddenException("Only developer can close platform accounts.");
    const account = await this.prisma.account.update({ where: { id: accountId }, data: { status: "closed" } });
    this.realtime.emitAccountDataChanged({
      accountId,
      changedTables: ["accounts"],
      metadata: { action: "account-closed" },
    });
    return account;
  }

  async getUsers(
    actor: AuthUser,
    accountId?: string,
    filters?: {
      schoolId?: string;
      branchId?: string;
    },
  ) {
    const id = accountId || actor.accountId;
    assertSameAccountOrDeveloper(actor, id);

    const schoolId = filters?.schoolId?.trim() || undefined;
    const branchId = filters?.branchId?.trim() || undefined;
    const actorRole = this.normalizedActorRole(actor.role);

    /*
     * Branch administrators must always be constrained to one of their active
     * branch-admin memberships. Query parameters are treated as requested
     * scope, never as authority.
     */
    if (actorRole === "branch_admin") {
      if (!schoolId || !branchId) {
        throw new BadRequestException(
          "schoolId and branchId are required for branch-scoped user listing.",
        );
      }

      const branchAccess = await this.prisma.userMembership.findFirst({
        where: {
          accountId: id,
          userId: actor.id,
          role: "branch_admin",
          schoolId,
          branchId,
          active: true,
          status: "active",
        },
        select: { id: true },
      });

      if (!branchAccess) {
        throw new ForbiddenException(
          "You cannot view users for this branch.",
        );
      }
    }

    const membershipWhere = {
      accountId: id,
      ...(schoolId ? { schoolId } : {}),
      ...(branchId ? { branchId } : {}),
    };

    return this.prisma.appUser.findMany({
      where: {
        accountId: id,
        ...(schoolId || branchId
          ? {
              memberships: {
                some: membershipWhere,
              },
            }
          : {}),
      },
      select: {
        id: true,
        accountId: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          where: membershipWhere,
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createUser(actor: AuthUser, dto: CreateAccountUserDto, accountId?: string) {
    this.assertCanCreateUsers(actor.role);
    const targetAccountId = accountId || actor.accountId;
    assertSameAccountOrDeveloper(actor, targetAccountId);

    const role = normalizeRole(dto.role);
    if (!role) throw new BadRequestException("Invalid role.");

    const actorRole = this.normalizedActorRole(actor.role);

    if (actorRole === "branch_admin") {
      if (!BRANCH_ASSIGNABLE_ROLES.has(role)) {
        throw new ForbiddenException(
          "Branch administrators can only create accountant, teacher, student, and parent users.",
        );
      }

      if (!dto.schoolId || !dto.branchId) {
        throw new BadRequestException(
          "School and branch are required for branch-created users.",
        );
      }

      const branchAccess = await this.prisma.userMembership.findFirst({
        where: {
          accountId: targetAccountId,
          userId: actor.id,
          role: "branch_admin",
          schoolId: dto.schoolId,
          branchId: dto.branchId,
          active: true,
          status: "active",
        },
        select: { id: true },
      });

      if (!branchAccess) {
        throw new ForbiddenException(
          "You cannot create users for this branch.",
        );
      }
    }
    if ((role === "developer" || role === "platform_team") && !isDeveloper(actor.role)) throw new ForbiddenException("Only developer can create developer users.");
    if (role === "super_admin" || role === "owner") this.assertCanManageOwnerOnly(actor.role);
    const canonicalRole = role === "admin" ? "school_admin" : role;

    if (
      !["developer", "platform_team", "owner", "super_admin"].includes(
        canonicalRole,
      ) &&
      (!dto.schoolId || !dto.branchId)
    ) {
      throw new BadRequestException(
        "School and branch are required for this role.",
      );
    }

    if (canonicalRole === "teacher" && !dto.teacherId) {
      throw new BadRequestException(
        "teacherId is required for a teacher user.",
      );
    }

    if (canonicalRole === "student" && !dto.studentId) {
      throw new BadRequestException(
        "studentId is required for a student user.",
      );
    }

    if (canonicalRole === "parent" && !dto.parentId) {
      throw new BadRequestException(
        "parentId is required for a parent user.",
      );
    }

    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.appUser.findUnique({ where: { email } });
    if (existing) throw new BadRequestException("This email is already registered.");
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.appUser.create({
        data: { accountId: targetAccountId, fullName: dto.fullName.trim(), email, phone: dto.phone?.trim() || null, passwordHash, role: canonicalRole, active: true },
      });
      await tx.userMembership.create({
        data: {
          accountId: targetAccountId,
          userId: user.id,
          role: canonicalRole,
          schoolId: dto.schoolId ?? null,
          branchId: dto.branchId ?? null,
          teacherId: dto.teacherId ?? null,
          studentId: dto.studentId ?? null,
          parentId: dto.parentId ?? null,
          scopeKey: buildMembershipScopeKey({
            accountId: targetAccountId,
            role: canonicalRole,
            schoolId: dto.schoolId,
            branchId: dto.branchId,
            teacherId: dto.teacherId,
            studentId: dto.studentId,
            parentId: dto.parentId,
          }),
          active: true,
        },
      });
      return tx.appUser.findUnique({ where: { id: user.id }, select: { id: true, accountId: true, fullName: true, email: true, phone: true, role: true, active: true, createdAt: true, updatedAt: true, memberships: true } });
    });

    if (created?.id) {
      this.realtime.emitMembershipsChanged({
        accountId: targetAccountId,
        userId: created.id,
        action: "created",
        active: created.active !== false,
        metadata: {
          operation: "user-created",
        },
      });
    }

    return created;
  }

  async updateUser(actor: AuthUser, userId: string, dto: UpdateAccountUserDto) {
    this.assertCanManageAccountUsers(actor.role);
    const existing = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException("User not found.");
    assertSameAccountOrDeveloper(actor, existing.accountId);
    if ([dto.role, existing.role].includes("developer") || [dto.role, existing.role].includes("platform_team")) { if (!isDeveloper(actor.role)) throw new ForbiddenException("Only developer can manage platform users."); }
    if ([dto.role, existing.role].includes("super_admin") || [dto.role, existing.role].includes("owner")) this.assertCanManageOwnerOnly(actor.role);
    const user = await this.prisma.appUser.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName?.trim(),
        phone: dto.phone?.trim(),
        role:
          dto.role !== undefined
            ? this.normalizedActorRole(dto.role)
            : undefined,
      },
      select: { id: true, accountId: true, fullName: true, email: true, phone: true, role: true, active: true, lastLoginAt: true, createdAt: true, updatedAt: true, memberships: true },
    });

    this.realtime.emitMembershipsChanged({
      accountId: existing.accountId,
      userId: user.id,
      action: "updated",
      active: user.active !== false,
      metadata: {
        operation: "user-updated",
      },
    });

    return user;
  }

  async updateUserStatus(actor: AuthUser, userId: string, dto: UpdateAccountUserStatusDto) {
    this.assertCanManageAccountUsers(actor.role);
    const existing = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException("User not found.");
    assertSameAccountOrDeveloper(actor, existing.accountId);
    if ((existing.role === "developer" || existing.role === "platform_team") && !isDeveloper(actor.role)) throw new ForbiddenException("Only developer can manage platform users.");
    if (existing.role === "super_admin" || existing.role === "owner") this.assertCanManageOwnerOnly(actor.role);
    if (existing.id === actor.id && dto.active === false) throw new BadRequestException("You cannot deactivate your own login.");
    const user = await this.prisma.appUser.update({ where: { id: userId }, data: { active: dto.active }, select: { id: true, active: true, role: true, email: true } });
    this.realtime.emitMembershipsChanged({
      accountId: existing.accountId,
      userId: user.id,
      action: dto.active ? "activated" : "deactivated",
      active: user.active !== false,
      metadata: {
        operation: dto.active
          ? "user-activated"
          : "user-deactivated",
      },
    });
    return user;
  }

  async deleteUser(actor: AuthUser, userId: string) {
    return this.updateUserStatus(actor, userId, { active: false });
  }

  async getOwnerRecords(accountId: string, tableName: "schools" | "branches") {
  const records = await this.prisma.syncRecord.findMany({
    where: {
      accountId,
      tableName,
      isDeleted: false,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return records.map((record) => ({
    id: record.id,
    localId: record.localId,
    cloudId: record.cloudId,
    ...((record.payload as any) || {}),
  }));
}

async createOwnerRecord(
  accountId: string,
  tableName: "schools" | "branches",
  body: any
) {
  const now = Date.now();

  const record = await this.prisma.syncRecord.create({
    data: {
      accountId,
      tableName,
      localId:
        body.id !== undefined && body.id !== null
          ? String(body.id)
          : undefined,
      cloudId: body.cloudId,
      deviceId: body.deviceId || "owner-web",
      version: 1,
      updatedAt: BigInt(now),
      isDeleted: false,
      payload: {
        ...body,
        accountId,
        updatedAt: now,
        version: 1,
        isDeleted: false,
      },
    },
  });

  this.realtime.emitAccountDataChanged({
    accountId,
    changedTables: [tableName],
    sourceDeviceId: body.deviceId || "owner-web",
    metadata: { action: "owner-record-created", recordId: record.id },
  });

  return record;
}

async updateOwnerRecord(accountId: string, id: string, body: any) {
  const existing = await this.prisma.syncRecord.findFirst({
    where: { id, accountId },
  });

  if (!existing) {
    throw new NotFoundException("Record not found.");
  }

  const now = Date.now();

  const record = await this.prisma.syncRecord.update({
    where: { id },
    data: {
      version: existing.version + 1,
      updatedAt: BigInt(now),
      payload: {
        ...((existing.payload as any) || {}),
        ...body,
        accountId,
        updatedAt: now,
        version: existing.version + 1,
      },
    },
  });

  this.realtime.emitAccountDataChanged({
    accountId,
    changedTables: [existing.tableName],
    sourceDeviceId: body.deviceId,
    metadata: { action: "owner-record-updated", recordId: id },
  });

  return record;
}

async deleteOwnerRecord(accountId: string, id: string) {
  const existing = await this.prisma.syncRecord.findFirst({
    where: { id, accountId },
  });

  if (!existing) {
    throw new NotFoundException("Record not found.");
  }

  const record = await this.prisma.syncRecord.update({
    where: { id },
    data: {
      isDeleted: true,
      version: existing.version + 1,
      updatedAt: BigInt(Date.now()),
    },
  });

  this.realtime.emitAccountDataChanged({
    accountId,
    changedTables: [existing.tableName],
    metadata: { action: "owner-record-deleted", recordId: id },
  });

  return record;
}
}
