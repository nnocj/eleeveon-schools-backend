import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { Prisma } from "@prisma/client";

import { AuthUser } from "../common/auth-user";
import { isDeveloper, normalizeRole } from "../common/roles";
import { assertSameAccountOrDeveloper } from "../common/scope";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";

import {
  CreateMembershipDto,
  UpdateMembershipDto,
} from "./dto/membership.dto";

const MEMBERSHIP_MANAGERS = new Set<string>([
  "developer",
  "super_admin",
  "school_admin",
  "admin",
  "branch_admin",
]);

type NullableId = string | number | null | undefined;

type ManagerScope = {
  accountWide: boolean;
  schoolIds: Set<string>;
  branchIds: Set<string>;
};

type MembershipIdentity = {
  role: string;
  schoolId: string | null;
  branchId: string | null;
  teacherId: string | null;
  studentId: string | null;
  parentId: string | null;
};

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  /**
   * Converts old numeric Dexie identifiers and new permanent identifiers
   * into the string format now required by Prisma.
   */
  private normalizeId(value: NullableId): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = String(value).trim();

    return normalized.length > 0 ? normalized : null;
  }

  /**
   * Keeps temporary compatibility with the old "admin" role while storing
   * the canonical "school_admin" role.
   */
  private normalizeMembershipRole(
    role: string | null | undefined,
  ): string {
    const normalized = normalizeRole(String(role ?? ""));

    if (!normalized) {
      throw new BadRequestException("Invalid membership role.");
    }

    return normalized === "admin" ? "school_admin" : normalized;
  }

  private assertManager(role: string | null | undefined): void {
    const rawRole = String(role ?? "").trim().toLowerCase();
    const normalizedRole =
      rawRole === "admin"
        ? "school_admin"
        : rawRole;

    if (!MEMBERSHIP_MANAGERS.has(normalizedRole)) {
      throw new ForbiddenException(
        "You cannot manage memberships.",
      );
    }
  }

  private buildScopeKey(identity: MembershipIdentity): string {
    if (identity.studentId) {
      return `${identity.role}:student:${identity.studentId}`;
    }

    if (identity.teacherId) {
      return `${identity.role}:teacher:${identity.teacherId}`;
    }

    if (identity.parentId) {
      return `${identity.role}:parent:${identity.parentId}`;
    }

    if (identity.branchId) {
      return `${identity.role}:branch:${identity.branchId}`;
    }

    if (identity.schoolId) {
      return `${identity.role}:school:${identity.schoolId}`;
    }

    return `${identity.role}:account`;
  }

  private validateIdentity(identity: MembershipIdentity): void {
    if (identity.branchId && !identity.schoolId) {
      throw new BadRequestException(
        "A branch membership must also include schoolId.",
      );
    }

    if (
      identity.role === "school_admin" &&
      !identity.schoolId
    ) {
      throw new BadRequestException(
        "A school administrator membership requires schoolId.",
      );
    }

    if (
      identity.role === "branch_admin" &&
      !identity.branchId
    ) {
      throw new BadRequestException(
        "A branch administrator membership requires branchId.",
      );
    }

    if (
      identity.role === "teacher" &&
      !identity.teacherId
    ) {
      throw new BadRequestException(
        "A teacher membership requires teacherId.",
      );
    }

    if (
      identity.role === "student" &&
      !identity.studentId
    ) {
      throw new BadRequestException(
        "A student membership requires studentId.",
      );
    }

    if (
      identity.role === "parent" &&
      !identity.parentId
    ) {
      throw new BadRequestException(
        "A parent membership requires parentId.",
      );
    }

    if (
      ["developer", "super_admin"].includes(identity.role) &&
      (identity.schoolId || identity.branchId)
    ) {
      throw new BadRequestException(
        `${identity.role} must be account-wide.`,
      );
    }
  }

  private readTeacherId(
    dto: CreateMembershipDto | UpdateMembershipDto,
  ): string | null {
    return this.normalizeId(dto.teacherId);
  }

  private readStudentId(
    dto: CreateMembershipDto | UpdateMembershipDto,
  ): string | null {
    return this.normalizeId(dto.studentId);
  }

  private readParentId(
    dto: CreateMembershipDto | UpdateMembershipDto,
  ): string | null {
    return this.normalizeId(dto.parentId);
  }

  private readOptionalProperties(
    dto: CreateMembershipDto | UpdateMembershipDto,
  ) {
    return dto as unknown as {
      status?: string;
      active?: boolean;
      isDefault?: boolean;
      label?: string | null;
      metadata?: Prisma.InputJsonValue;
      invitedAt?: Date | string | null;
      acceptedAt?: Date | string | null;
      suspendedAt?: Date | string | null;
      endedAt?: Date | string | null;
    };
  }

  private normalizeDate(
    value: Date | string | null | undefined,
  ): Date | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    const date =
      value instanceof Date
        ? value
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        "One or more membership dates are invalid.",
      );
    }

    return date;
  }

  private async managerScope(
    actor: AuthUser,
    accountId: string,
  ): Promise<ManagerScope> {
    assertSameAccountOrDeveloper(actor, accountId);

    const actorRole = this.normalizeMembershipRole(actor.role);

    if (
      actorRole === "developer" ||
      actorRole === "super_admin"
    ) {
      return {
        accountWide: true,
        schoolIds: new Set<string>(),
        branchIds: new Set<string>(),
      };
    }

    const memberships =
      await this.prisma.userMembership.findMany({
        where: {
          accountId,
          userId: actor.id,
          active: true,
          status: "active",
        },
        select: {
          role: true,
          schoolId: true,
          branchId: true,
        },
      });

    if (!memberships.length) {
      throw new ForbiddenException(
        "No active membership grants this operation.",
      );
    }

    const schoolIds = new Set<string>();
    const branchIds = new Set<string>();

    let accountWide = false;

    for (const membership of memberships) {
      const membershipRole =
        this.normalizeMembershipRole(membership.role);

      if (
        membershipRole === "super_admin" &&
        !membership.schoolId &&
        !membership.branchId
      ) {
        accountWide = true;
      }

      if (membership.schoolId) {
        schoolIds.add(membership.schoolId);
      }

      if (membership.branchId) {
        branchIds.add(membership.branchId);
      }
    }

    return {
      accountWide,
      schoolIds,
      branchIds,
    };
  }

  private async assertAssignmentAllowed(
    actor: AuthUser,
    accountId: string,
    schoolId?: NullableId,
    branchId?: NullableId,
  ): Promise<void> {
    const normalizedSchoolId =
      this.normalizeId(schoolId);

    const normalizedBranchId =
      this.normalizeId(branchId);

    const scope = await this.managerScope(
      actor,
      accountId,
    );

    if (scope.accountWide) {
      return;
    }

    if (
      normalizedBranchId &&
      !scope.branchIds.has(normalizedBranchId)
    ) {
      throw new ForbiddenException(
        "You cannot manage memberships for this branch.",
      );
    }

    if (
      normalizedSchoolId &&
      !scope.schoolIds.has(normalizedSchoolId)
    ) {
      throw new ForbiddenException(
        "You cannot manage memberships for this school.",
      );
    }

    if (
      !normalizedSchoolId &&
      !normalizedBranchId
    ) {
      throw new ForbiddenException(
        "Only an account-wide manager may manage an account-wide membership.",
      );
    }
  }

  private async assertScopeKeyAvailable(
    accountId: string,
    userId: string,
    scopeKey: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate =
      await this.prisma.userMembership.findFirst({
        where: {
          accountId,
          userId,
          scopeKey,
          ...(excludeId
            ? {
                id: {
                  not: excludeId,
                },
              }
            : {}),
        },
        select: {
          id: true,
        },
      });

    if (duplicate) {
      throw new BadRequestException(
        "This user already has the same membership.",
      );
    }
  }

  async list(
    actor: AuthUser,
    accountId?: string,
  ) {
    this.assertManager(actor.role);

    const targetAccountId =
      accountId || actor.accountId;

    const scope = await this.managerScope(
      actor,
      targetAccountId,
    );

    if (
      !scope.accountWide &&
      scope.schoolIds.size === 0 &&
      scope.branchIds.size === 0
    ) {
      return [];
    }

    const scopedConditions: Prisma.UserMembershipWhereInput[] =
      [];

    if (scope.branchIds.size > 0) {
      scopedConditions.push({
        branchId: {
          in: [...scope.branchIds],
        },
      });
    }

    if (scope.schoolIds.size > 0) {
      scopedConditions.push({
        schoolId: {
          in: [...scope.schoolIds],
        },
        branchId: null,
      });
    }

    const where: Prisma.UserMembershipWhereInput = {
      accountId: targetAccountId,
      ...(scope.accountWide
        ? {}
        : {
            OR: scopedConditions,
          }),
    };

    return this.prisma.userMembership.findMany({
      where,
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
      orderBy: [
        {
          isDefault: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
    });
  }

  async create(
    actor: AuthUser,
    dto: CreateMembershipDto,
    accountId?: string,
  ) {
    this.assertManager(actor.role);

    const targetAccountId =
      accountId || actor.accountId;

    assertSameAccountOrDeveloper(
      actor,
      targetAccountId,
    );

    const role =
      this.normalizeMembershipRole(dto.role);

    if (
      role === "developer" &&
      !isDeveloper(actor.role)
    ) {
      throw new ForbiddenException(
        "Only a developer can assign the developer role.",
      );
    }

    const schoolId =
      this.normalizeId(dto.schoolId);

    const branchId =
      this.normalizeId(dto.branchId);

    const identity: MembershipIdentity = {
      role,
      schoolId,
      branchId,
      teacherId: this.readTeacherId(dto),
      studentId: this.readStudentId(dto),
      parentId: this.readParentId(dto),
    };

    this.validateIdentity(identity);

    await this.assertAssignmentAllowed(
      actor,
      targetAccountId,
      schoolId,
      branchId,
    );

    const user =
      await this.prisma.appUser.findFirst({
        where: {
          id: dto.userId,
          accountId: targetAccountId,
          active: true,
        },
        select: {
          id: true,
        },
      });

    if (!user) {
      throw new NotFoundException(
        "User not found in this account.",
      );
    }

    const scopeKey =
      this.buildScopeKey(identity);

    await this.assertScopeKeyAvailable(
      targetAccountId,
      dto.userId,
      scopeKey,
    );

    const optional =
      this.readOptionalProperties(dto);

    const active = optional.active ?? true;

    const status =
      optional.status ??
      (active ? "active" : "suspended");

    const membership =
      await this.prisma.$transaction(
        async (transaction) => {
          if (optional.isDefault === true) {
            await transaction.userMembership.updateMany({
              where: {
                accountId: targetAccountId,
                userId: dto.userId,
                isDefault: true,
              },
              data: {
                isDefault: false,
              },
            });
          }

          return transaction.userMembership.create({
            data: {
              accountId: targetAccountId,
              userId: dto.userId,
              role,
              schoolId,
              branchId,
              teacherId: identity.teacherId,
              studentId: identity.studentId,
              parentId: identity.parentId,
              scopeKey,
              status,
              active,
              isDefault:
                optional.isDefault ?? false,
              label:
                optional.label ?? null,
              metadata: optional.metadata,
              invitedAt: this.normalizeDate(
                optional.invitedAt,
              ),
              acceptedAt:
                this.normalizeDate(
                  optional.acceptedAt,
                ) ??
                (status === "active"
                  ? new Date()
                  : undefined),
              suspendedAt:
                this.normalizeDate(
                  optional.suspendedAt,
                ) ??
                (status === "suspended"
                  ? new Date()
                  : undefined),
              endedAt: this.normalizeDate(
                optional.endedAt,
              ),
              createdByUserId: actor.id,
            },
          });
        },
      );

    this.realtime.emitMembershipsChanged({
      accountId: targetAccountId,
      userId: membership.userId,
      membershipId: membership.id,
      action: "created",
      active: membership.active,
      schoolId: membership.schoolId,
      branchId: membership.branchId,
      metadata: {
        role: membership.role,
        status: membership.status,
        scopeKey: membership.scopeKey,
        isDefault: membership.isDefault,
      },
    });

    return membership;
  }

  async update(
    actor: AuthUser,
    id: string,
    dto: UpdateMembershipDto,
  ) {
    this.assertManager(actor.role);

    const existing =
      await this.prisma.userMembership.findUnique({
        where: {
          id,
        },
      });

    if (!existing) {
      throw new NotFoundException(
        "Membership not found.",
      );
    }

    assertSameAccountOrDeveloper(
      actor,
      existing.accountId,
    );

    const role =
      dto.role !== undefined
        ? this.normalizeMembershipRole(dto.role)
        : this.normalizeMembershipRole(
            existing.role,
          );

    if (
      (existing.role === "developer" ||
        role === "developer") &&
      !isDeveloper(actor.role)
    ) {
      throw new ForbiddenException(
        "Only a developer can manage developer memberships.",
      );
    }

    const schoolId =
      dto.schoolId !== undefined
        ? this.normalizeId(dto.schoolId)
        : existing.schoolId;

    const branchId =
      dto.branchId !== undefined
        ? this.normalizeId(dto.branchId)
        : existing.branchId;

    const teacherWasProvided =
      dto.teacherId !== undefined;

    const studentWasProvided =
      dto.studentId !== undefined;

    const parentWasProvided =
      dto.parentId !== undefined;

    const identity: MembershipIdentity = {
      role,
      schoolId,
      branchId,
      teacherId: teacherWasProvided
        ? this.readTeacherId(dto)
        : existing.teacherId,
      studentId: studentWasProvided
        ? this.readStudentId(dto)
        : existing.studentId,
      parentId: parentWasProvided
        ? this.readParentId(dto)
        : existing.parentId,
    };

    this.validateIdentity(identity);

    await this.assertAssignmentAllowed(
      actor,
      existing.accountId,
      schoolId,
      branchId,
    );

    const scopeKey =
      this.buildScopeKey(identity);

    await this.assertScopeKeyAvailable(
      existing.accountId,
      existing.userId,
      scopeKey,
      existing.id,
    );

    const optional =
      this.readOptionalProperties(dto);

    const active =
      optional.active !== undefined
        ? optional.active
        : existing.active;

    let status =
      optional.status !== undefined
        ? optional.status
        : existing.status;

    if (
      optional.active === false &&
      optional.status === undefined
    ) {
      status = "suspended";
    }

    if (
      optional.active === true &&
      optional.status === undefined
    ) {
      status = "active";
    }

    const membership =
      await this.prisma.$transaction(
        async (transaction) => {
          if (optional.isDefault === true) {
            await transaction.userMembership.updateMany({
              where: {
                accountId: existing.accountId,
                userId: existing.userId,
                id: {
                  not: existing.id,
                },
                isDefault: true,
              },
              data: {
                isDefault: false,
              },
            });
          }

          const data: Prisma.UserMembershipUncheckedUpdateInput =
            {
              role,
              schoolId,
              branchId,
              teacherId: identity.teacherId,
              studentId: identity.studentId,
              parentId: identity.parentId,
              scopeKey,
              status,
              active,
            };

          if (optional.isDefault !== undefined) {
            data.isDefault =
              optional.isDefault;
          }

          if (optional.label !== undefined) {
            data.label = optional.label;
          }

          if (optional.metadata !== undefined) {
            data.metadata = optional.metadata;
          }

          if (optional.invitedAt !== undefined) {
            data.invitedAt =
              this.normalizeDate(
                optional.invitedAt,
              );
          }

          if (optional.acceptedAt !== undefined) {
            data.acceptedAt =
              this.normalizeDate(
                optional.acceptedAt,
              );
          } else if (
            status === "active" &&
            !existing.acceptedAt
          ) {
            data.acceptedAt = new Date();
          }

          if (
            optional.suspendedAt !== undefined
          ) {
            data.suspendedAt =
              this.normalizeDate(
                optional.suspendedAt,
              );
          } else if (status === "suspended") {
            data.suspendedAt =
              existing.suspendedAt ??
              new Date();
          } else if (
            existing.status === "suspended" &&
            status === "active"
          ) {
            data.suspendedAt = null;
          }

          if (optional.endedAt !== undefined) {
            data.endedAt =
              this.normalizeDate(
                optional.endedAt,
              );
          } else if (
            ["revoked", "expired"].includes(
              status,
            ) &&
            !existing.endedAt
          ) {
            data.endedAt = new Date();
          }

          return transaction.userMembership.update({
            where: {
              id,
            },
            data,
          });
        },
      );

    const action =
      existing.active !== membership.active
        ? membership.active
          ? "activated"
          : "deactivated"
        : "updated";

    this.realtime.emitMembershipsChanged({
      accountId: membership.accountId,
      userId: membership.userId,
      membershipId: membership.id,
      action,
      active: membership.active,
      schoolId: membership.schoolId,
      branchId: membership.branchId,
      metadata: {
        role: membership.role,
        previousRole: existing.role,
        status: membership.status,
        previousStatus: existing.status,
        scopeKey: membership.scopeKey,
        isDefault: membership.isDefault,
      },
    });

    return membership;
  }

  async remove(
    actor: AuthUser,
    id: string,
  ) {
    this.assertManager(actor.role);

    const existing =
      await this.prisma.userMembership.findUnique({
        where: {
          id,
        },
      });

    if (!existing) {
      throw new NotFoundException(
        "Membership not found.",
      );
    }

    assertSameAccountOrDeveloper(
      actor,
      existing.accountId,
    );

    await this.assertAssignmentAllowed(
      actor,
      existing.accountId,
      existing.schoolId,
      existing.branchId,
    );

    if (
      existing.role === "developer" &&
      !isDeveloper(actor.role)
    ) {
      throw new ForbiddenException(
        "Only a developer can remove developer memberships.",
      );
    }

    if (
      existing.userId === actor.id &&
      existing.active
    ) {
      throw new BadRequestException(
        "You cannot remove your own active membership.",
      );
    }

    const membership =
      await this.prisma.userMembership.delete({
        where: {
          id,
        },
      });

    this.realtime.emitMembershipsChanged({
      accountId: existing.accountId,
      userId: existing.userId,
      membershipId: existing.id,
      action: "deleted",
      active: false,
      schoolId: existing.schoolId,
      branchId: existing.branchId,
      metadata: {
        role: existing.role,
        status: existing.status,
        scopeKey: existing.scopeKey,
      },
    });

    return membership;
  }
}