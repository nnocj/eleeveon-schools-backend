import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { AuthUser } from "../common/auth-user";
import { assertSameAccountOrDeveloper } from "../common/scope";
import { isDeveloper, normalizeRole } from "../common/roles";
import { CreateAccountDto, CreateAccountUserDto, UpdateAccountDto, UpdateAccountUserDto, UpdateAccountUserStatusDto } from "./dto/account-users.dto";

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