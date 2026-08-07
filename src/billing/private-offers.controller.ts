import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthRequest } from "../common/auth-user";
import {
  AssignPrivateOfferDto,
  CreatePrivateOfferDto,
} from "./dto/private-offer.dto";
import { PrivateOffersService } from "./private-offers.service";

@Controller("billing/private-offers")
@UseGuards(JwtAuthGuard)
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
      request.user.id,
    );
  }

  @Post("assign")
  assign(
    @Body() dto: AssignPrivateOfferDto,
    @Req() request: AuthRequest,
  ) {
    return this.offers.assign(
      dto,
      request.user.id,
    );
  }

  @Post("assignments/:id/revoke")
  revoke(
    @Param("id") id: string,
    @Req() request: AuthRequest,
  ) {
    return this.offers.revoke(
      id,
      request.user.id,
    );
  }
}
