import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { PrivateOffersService } from "./private-offers.service";
import { AssignPrivateOfferDto, CreatePrivateOfferDto, UpdatePrivateOfferDto } from "./dto/private-offer.dto";

@Controller("billing/private-offers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("developer", "platform_team")
export class PrivateOffersController {
  constructor(private readonly service: PrivateOffersService) {}

  @Get()
  list(@Req() req: any, @Query("includeInactive") includeInactive?: string) {
    return this.service.list(req.user, includeInactive === "true");
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreatePrivateOfferDto) {
    return this.service.create(req.user, dto);
  }

  @Patch(":id")
  update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdatePrivateOfferDto) {
    return this.service.update(req.user, id, dto);
  }

  @Post(":id/assign")
  assign(@Req() req: any, @Param("id") id: string, @Body() dto: AssignPrivateOfferDto) {
    return this.service.assign(req.user, id, dto);
  }

  @Delete(":id/accounts/:accountId")
  revoke(@Req() req: any, @Param("id") id: string, @Param("accountId") accountId: string) {
    return this.service.revoke(req.user, id, accountId);
  }
}
