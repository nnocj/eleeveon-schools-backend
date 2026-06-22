import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "../common/auth-user";
import { assertSameAccountOrDeveloper } from "../common/scope";
import { isDeveloper, normalizeRole } from "../common/roles";
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
  constructor(private readonly prisma: PrismaService) {}

  private assertManager(role: string) {
    if (!MEMBERSHIP_MANAGERS.has(role)) {
      throw new ForbiddenException("You cannot manage memberships.");
    }
  }

  async list(actor: AuthUser, accountId?: string) {
    this.assertManager(actor.role);

    const targetAccountId = accountId || actor.accountId;
    assertSameAccountOrDeveloper(actor, targetAccountId);

    return this.prisma.userMembership.findMany({
      where: { accountId: targetAccountId },
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

    const role = normalizeRole(dto.role);
    if (!role) throw new BadRequestException("Invalid role.");

    if (role === "developer" && !isDeveloper(actor.role)) {
      throw new ForbiddenException("Only developer can assign developer role.");
    }

    const user = await this.prisma.appUser.findFirst({
      where: { id: dto.userId, accountId: targetAccountId },
    });

    if (!user) throw new NotFoundException("User not found in this account.");

    return this.prisma.userMembership.create({
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
  }

  async update(actor: AuthUser, id: string, dto: UpdateMembershipDto) {
    this.assertManager(actor.role);

    const existing = await this.prisma.userMembership.findUnique({
      where: { id },
    });

    if (!existing) throw new NotFoundException("Membership not found.");

    assertSameAccountOrDeveloper(actor, existing.accountId);

    if (
      (existing.role === "developer" || dto.role === "developer") &&
      !isDeveloper(actor.role)
    ) {
      throw new ForbiddenException("Only developer can manage developer memberships.");
    }

    return this.prisma.userMembership.update({
      where: { id },
      data: dto,
    });
  }

  async remove(actor: AuthUser, id: string) {
    this.assertManager(actor.role);

    const existing = await this.prisma.userMembership.findUnique({
      where: { id },
    });

    if (!existing) throw new NotFoundException("Membership not found.");

    assertSameAccountOrDeveloper(actor, existing.accountId);

    if (existing.role === "developer" && !isDeveloper(actor.role)) {
      throw new ForbiddenException("Only developer can remove developer memberships.");
    }

    if (existing.userId === actor.id && existing.active !== false) {
      throw new BadRequestException("You cannot remove your own active membership.");
    }

    // IMPORTANT FIX:
    // Previously this method returned:
    //   return this.update(actor, id, { active: false });
    //
    // That only deactivated the role. The School Admin "Delete Role" button
    // expects the UserMembership row to be removed from the database.
    //
    // This deletes only the membership/role. It does NOT delete the AppUser,
    // so the same person can still keep other memberships if they have them.
    return this.prisma.userMembership.delete({
      where: { id },
    });
  }
}
