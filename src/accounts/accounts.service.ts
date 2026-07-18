import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { AuthUser } from "../common/auth-user";
import { assertSameAccountOrDeveloper } from "../common/scope";
import { isDeveloper, normalizeRole } from "../common/roles";
import { CreateAccountDto, CreateAccountUserDto, UpdateAccountDto, UpdateAccountUserDto, UpdateAccountUserStatusDto } from "./dto/account-users.dto";

const USER_MANAGEMENT_ROLES = new Set(["developer", "platform_team", "owner", "super_admin", "admin", "branch_admin"]);
const OWNER_ONLY_ROLES = new Set(["developer", "platform_team", "owner", "super_admin"]);

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  private assertCanManageUsers(role: string) {
    if (!USER_MANAGEMENT_ROLES.has(role)) {
      throw new ForbiddenException("You do not have permission to manage account users.");
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

  async getUsers(actor: AuthUser, accountId?: string) {
    const id = accountId || actor.accountId;
    assertSameAccountOrDeveloper(actor, id);
    return this.prisma.appUser.findMany({
      where: { accountId: id },
      select: {
        id: true, accountId: true, fullName: true, email: true, phone: true, role: true, active: true, lastLoginAt: true, createdAt: true, updatedAt: true,
        memberships: { where: { accountId: id }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createUser(actor: AuthUser, dto: CreateAccountUserDto, accountId?: string) {
    this.assertCanManageUsers(actor.role);
    const targetAccountId = accountId || actor.accountId;
    assertSameAccountOrDeveloper(actor, targetAccountId);

    const role = normalizeRole(dto.role);
    if (!role) throw new BadRequestException("Invalid role.");
    if ((role === "developer" || role === "platform_team") && !isDeveloper(actor.role)) throw new ForbiddenException("Only developer can create developer users.");
    if (role === "super_admin" || role === "owner") this.assertCanManageOwnerOnly(actor.role);
    if (!["developer", "platform_team", "owner", "super_admin"].includes(role) && (!dto.schoolId || !dto.branchId)) {
      throw new BadRequestException("School and branch are required for this role.");
    }

    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.appUser.findUnique({ where: { email } });
    if (existing) throw new BadRequestException("This email is already registered.");
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.appUser.create({
        data: { accountId: targetAccountId, fullName: dto.fullName.trim(), email, phone: dto.phone?.trim() || null, passwordHash, role, active: true },
      });
      await tx.userMembership.create({
        data: { accountId: targetAccountId, userId: user.id, role, schoolId: dto.schoolId, branchId: dto.branchId, teacherLocalId: dto.teacherLocalId, studentLocalId: dto.studentLocalId, parentLocalId: dto.parentLocalId, active: true },
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
    this.assertCanManageUsers(actor.role);
    const existing = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException("User not found.");
    assertSameAccountOrDeveloper(actor, existing.accountId);
    if ([dto.role, existing.role].includes("developer") || [dto.role, existing.role].includes("platform_team")) { if (!isDeveloper(actor.role)) throw new ForbiddenException("Only developer can manage platform users."); }
    if ([dto.role, existing.role].includes("super_admin") || [dto.role, existing.role].includes("owner")) this.assertCanManageOwnerOnly(actor.role);
    const user = await this.prisma.appUser.update({
      where: { id: userId },
      data: { fullName: dto.fullName?.trim(), phone: dto.phone?.trim(), role: dto.role },
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
    this.assertCanManageUsers(actor.role);
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
      localId: body.id ? Number(body.id) : undefined,
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