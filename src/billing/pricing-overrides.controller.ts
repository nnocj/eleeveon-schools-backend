import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { PricingOverridesService } from "./pricing-overrides.service";
import { CreatePricingOverrideDto, UpdatePricingOverrideDto } from "./dto/pricing-override.dto";

@Controller("billing/pricing-overrides")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("developer", "platform_team")
export class PricingOverridesController {
  constructor(private readonly service: PricingOverridesService) {}

  @Get()
  list(@Req() req: any, @Query("accountId") accountId?: string) {
    return this.service.list(req.user, accountId);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreatePricingOverrideDto) {
    return this.service.create(req.user, dto);
  }

  @Patch(":id")
  update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdatePricingOverrideDto) {
    return this.service.update(req.user, id, dto);
  }

  @Delete(":id")
  remove(@Req() req: any, @Param("id") id: string) {
    return this.service.remove(req.user, id);
  }
}
