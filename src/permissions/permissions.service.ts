import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "../common/auth-user";
import { assertSameAccountOrDeveloper } from "../common/scope";
import { isDeveloper } from "../common/roles";
import { CreatePermissionRuleDto, UpdatePermissionRuleDto } from "./dto/permissions.dto";

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertCanManage(actor: AuthUser) {
    if (!["developer", "super_admin"].includes(actor.role)) {
      throw new ForbiddenException("Only developer or owner can manage permission rules.");
    }
  }

  async list(actor: AuthUser, accountId?: string) {
    const targetAccountId = accountId || actor.accountId;
    assertSameAccountOrDeveloper(actor, targetAccountId);
    return this.prisma.permissionRule.findMany({ where: { accountId: targetAccountId }, orderBy: { moduleKey: "asc" } });
  }

  async create(actor: AuthUser, dto: CreatePermissionRuleDto, accountId?: string) {
    this.assertCanManage(actor);
    const targetAccountId = accountId || actor.accountId;
    assertSameAccountOrDeveloper(actor, targetAccountId);
    return this.prisma.permissionRule.upsert({
      where: { accountId_moduleKey: { accountId: targetAccountId, moduleKey: dto.moduleKey } },
      update: dto,
      create: { accountId: targetAccountId, ...dto },
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdatePermissionRuleDto) {
    this.assertCanManage(actor);
    const existing = await this.prisma.permissionRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Permission rule not found.");
    assertSameAccountOrDeveloper(actor, existing.accountId);
    if (existing.locked && !isDeveloper(actor.role)) throw new ForbiddenException("This permission rule is locked.");
    return this.prisma.permissionRule.update({ where: { id }, data: dto });
  }

  async remove(actor: AuthUser, id: string) {
    this.assertCanManage(actor);
    const existing = await this.prisma.permissionRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Permission rule not found.");
    assertSameAccountOrDeveloper(actor, existing.accountId);
    if (existing.locked && !isDeveloper(actor.role)) throw new ForbiddenException("This permission rule is locked.");
    return this.prisma.permissionRule.delete({ where: { id } });
  }
}
