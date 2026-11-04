import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import type { AuthRequest } from "../common/auth-user";
import { UpsertPricingOverrideDto } from "./dto/pricing-override.dto";
import { PricingOverridesService } from "./pricing-overrides.service";

@Controller("billing/pricing-overrides")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("developer", "platform_team")
export class PricingOverridesController {
  constructor(
    private readonly overrides: PricingOverridesService,
  ) {}

  @Post()
  upsert(
    @Body() dto: UpsertPricingOverrideDto,
    @Req() request: AuthRequest,
  ) {
    return this.overrides.upsert(
      dto,
      request.user,
    );
  }

  @Post(":id/disable")
  disable(
    @Param("id") id: string,
    @Req() request: AuthRequest,
  ) {
    return this.overrides.disable(
      id,
      request.user,
    );
  }
}
