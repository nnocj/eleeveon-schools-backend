import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuthUser } from "../common/auth-user";
import { isDeveloper, normalizeRole } from "../common/roles";
import { assertSameAccountOrDeveloper } from "../common/scope";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";

import {
  CreateMembershipDto,
  UpdateMembershipDto,
} from "./dto/membership.dto";

const MEMBERSHIP_MANAGERS = new Set([
  "developer",
  "super_admin",
  "admin",
  "branch_admin",
]);

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  private assertManager(role: string) {
    if (!MEMBERSHIP_MANAGERS.has(String(role || "").toLowerCase())) {
      throw new ForbiddenException("You cannot manage memberships.");
    }
  }

  private async managerScope(actor: AuthUser, accountId: string) {
    assertSameAccountOrDeveloper(actor, accountId);
    const role = String(actor.role || "").toLowerCase();

    if (["developer", "super_admin"].includes(role)) {
      return { accountWide: true, schoolIds: new Set<number>(), branchIds: new Set<number>() };
    }

    const memberships = await this.prisma.userMembership.findMany({
      where: { accountId, userId: actor.id, active: true },
      select: { role: true, schoolId: true, branchId: true },
    });

    if (!memberships.length) {
      throw new ForbiddenException("No active membership grants this operation.");
    }

    const schoolIds = new Set<number>();
    const branchIds = new Set<number>();
    let accountWide = false;

    for (const membership of memberships) {
      const membershipRole = String(membership.role || "").toLowerCase();
      if (["super_admin", "admin"].includes(membershipRole) && !membership.schoolId && !membership.branchId) {
        accountWide = true;
      }
      if (membership.schoolId) schoolIds.add(Number(membership.schoolId));
      if (membership.branchId) branchIds.add(Number(membership.branchId));
    }

    return { accountWide, schoolIds, branchIds };
  }

  private async assertAssignmentAllowed(
    actor: AuthUser,
    accountId: string,
    schoolId?: number | null,
    branchId?: number | null,
  ) {
    const scope = await this.managerScope(actor, accountId);
    if (scope.accountWide) return;

    if (branchId && !scope.branchIds.has(Number(branchId))) {
      throw new ForbiddenException("You cannot manage memberships for this branch.");
    }

    if (schoolId && !scope.schoolIds.has(Number(schoolId))) {
      throw new ForbiddenException("You cannot manage memberships for this school.");
    }

    if (!schoolId && !branchId) {
      throw new ForbiddenException("Only an account-wide manager may create an account-wide membership.");
    }
  }

  async list(actor: AuthUser, accountId?: string) {
    this.assertManager(actor.role);
    const targetAccountId = accountId || actor.accountId;
    const scope = await this.managerScope(actor, targetAccountId);

    return this.prisma.userMembership.findMany({
      where: {
        accountId: targetAccountId,
        ...(scope.accountWide
          ? {}
          : {
              OR: [
                ...(scope.branchIds.size ? [{ branchId: { in: [...scope.branchIds] } }] : []),
                ...(scope.schoolIds.size ? [{ schoolId: { in: [...scope.schoolIds] }, branchId: null }] : []),
              ],
            }),
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            role: true,
            active: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(actor: AuthUser, dto: CreateMembershipDto, accountId?: string) {
    this.assertManager(actor.role);
    const targetAccountId = accountId || actor.accountId;
    assertSameAccountOrDeveloper(actor, targetAccountId);
    await this.assertAssignmentAllowed(actor, targetAccountId, dto.schoolId, dto.branchId);

    const role = normalizeRole(dto.role);
    if (!role) throw new BadRequestException("Invalid role.");
    if (role === "developer" && !isDeveloper(actor.role)) {
      throw new ForbiddenException("Only developer can assign developer role.");
    }

    const user = await this.prisma.appUser.findFirst({
      where: { id: dto.userId, accountId: targetAccountId, active: true },
    });
    if (!user) throw new NotFoundException("User not found in this account.");

    const membership = await this.prisma.userMembership.create({
      data: {
        accountId: targetAccountId,
        userId: dto.userId,
        role,
        schoolId: dto.schoolId,
        branchId: dto.branchId,
        teacherLocalId: dto.teacherLocalId,
        studentLocalId: dto.studentLocalId,
        parentLocalId: dto.parentLocalId,
        active: true,
      },
    });

    this.realtime.emitMembershipsChanged({
      accountId: targetAccountId,
      userId: membership.userId,
      membershipId: membership.id,
      action: "created",
      active: true,
      schoolId: membership.schoolId,
      branchId: membership.branchId,
      metadata: { role: membership.role },
    });

    return membership;
  }

  async update(actor: AuthUser, id: string, dto: UpdateMembershipDto) {
    this.assertManager(actor.role);
    const existing = await this.prisma.userMembership.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Membership not found.");
    assertSameAccountOrDeveloper(actor, existing.accountId);

    const nextSchoolId = dto.schoolId !== undefined ? dto.schoolId : existing.schoolId;
    const nextBranchId = dto.branchId !== undefined ? dto.branchId : existing.branchId;
    await this.assertAssignmentAllowed(actor, existing.accountId, nextSchoolId, nextBranchId);

    if ((existing.role === "developer" || dto.role === "developer") && !isDeveloper(actor.role)) {
      throw new ForbiddenException("Only developer can manage developer memberships.");
    }

    const membership = await this.prisma.userMembership.update({ where: { id }, data: dto });
    const action = existing.active !== membership.active
      ? membership.active === false ? "deactivated" : "activated"
      : "updated";

    this.realtime.emitMembershipsChanged({
      accountId: membership.accountId,
      userId: membership.userId,
      membershipId: membership.id,
      action,
      active: membership.active !== false,
      schoolId: membership.schoolId,
      branchId: membership.branchId,
      metadata: { role: membership.role, previousRole: existing.role },
    });

    return membership;
  }

  async remove(actor: AuthUser, id: string) {
    this.assertManager(actor.role);
    const existing = await this.prisma.userMembership.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Membership not found.");
    assertSameAccountOrDeveloper(actor, existing.accountId);
    await this.assertAssignmentAllowed(actor, existing.accountId, existing.schoolId, existing.branchId);

    if (existing.role === "developer" && !isDeveloper(actor.role)) {
      throw new ForbiddenException("Only developer can remove developer memberships.");
    }
    if (existing.userId === actor.id && existing.active !== false) {
      throw new BadRequestException("You cannot remove your own active membership.");
    }

    const membership = await this.prisma.userMembership.delete({ where: { id } });

    this.realtime.emitMembershipsChanged({
      accountId: existing.accountId,
      userId: existing.userId,
      membershipId: existing.id,
      action: "deleted",
      active: false,
      schoolId: existing.schoolId,
      branchId: existing.branchId,
      metadata: { role: existing.role },
    });

    return membership;
  }
}