import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { CreateMembershipDto, UpdateMembershipDto } from "./dto/membership.dto";
import { MembershipsService } from "./memberships.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("memberships")
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  list(@Req() req: any) {
    return this.membershipsService.list(req.user);
  }

  @Get("account/:accountId")
  listForAccount(@Req() req: any, @Param("accountId") accountId: string) {
    return this.membershipsService.list(req.user, accountId);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateMembershipDto) {
    return this.membershipsService.create(req.user, dto);
  }

  @Post("account/:accountId")
  createForAccount(@Req() req: any, @Param("accountId") accountId: string, @Body() dto: CreateMembershipDto) {
    return this.membershipsService.create(req.user, dto, accountId);
  }

  @Patch(":id")
  update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateMembershipDto) {
    return this.membershipsService.update(req.user, id, dto);
  }

  @Delete(":id")
  remove(@Req() req: any, @Param("id") id: string) {
    return this.membershipsService.remove(req.user, id);
  }
}
