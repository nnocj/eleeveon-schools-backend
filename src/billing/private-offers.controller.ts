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
import {
  AssignPrivateOfferDto,
  CreatePrivateOfferDto,
} from "./dto/private-offer.dto";
import { PrivateOffersService } from "./private-offers.service";

@Controller("billing/private-offers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("developer", "platform_team")
export class PrivateOffersController {
  constructor(
    private readonly offers: PrivateOffersService,
  ) {}

  @Post()
  create(
    @Body() dto: CreatePrivateOfferDto,
    @Req() request: AuthRequest,
  ) {
    return this.offers.create(
      dto,
      request.user,
    );
  }

  @Post("assign")
  assign(
    @Body() dto: AssignPrivateOfferDto,
    @Req() request: AuthRequest,
  ) {
    return this.offers.assign(
      dto,
      request.user,
    );
  }

  @Post("assignments/:id/revoke")
  revoke(
    @Param("id") id: string,
    @Req() request: AuthRequest,
  ) {
    return this.offers.revoke(
      id,
      request.user,
    );
  }
}
