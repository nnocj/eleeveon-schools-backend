import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { CreatePermissionRuleDto, UpdatePermissionRuleDto } from "./dto/permissions.dto";
import { PermissionsService } from "./permissions.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("permissions")
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  list(@Req() req: any) {
    return this.permissionsService.list(req.user);
  }

  @Get("account/:accountId")
  listForAccount(@Req() req: any, @Param("accountId") accountId: string) {
    return this.permissionsService.list(req.user, accountId);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreatePermissionRuleDto) {
    return this.permissionsService.create(req.user, dto);
  }

  @Post("account/:accountId")
  createForAccount(@Req() req: any, @Param("accountId") accountId: string, @Body() dto: CreatePermissionRuleDto) {
    return this.permissionsService.create(req.user, dto, accountId);
  }

  @Patch(":id")
  update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdatePermissionRuleDto) {
    return this.permissionsService.update(req.user, id, dto);
  }

  @Delete(":id")
  remove(@Req() req: any, @Param("id") id: string) {
    return this.permissionsService.remove(req.user, id);
  }
}
