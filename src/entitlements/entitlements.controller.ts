import {
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type {
  AuthRequest,
} from "../common/auth-user";
import { EntitlementsService } from "./entitlements.service";

@Controller("entitlements")
@UseGuards(JwtAuthGuard)
export class EntitlementsController {
  constructor(
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get("current")
  current(@Req() request: AuthRequest) {
    return this.entitlements.getAccess(
      request.user.accountId,
    );
  }

  @Post("rebuild")
  rebuild(@Req() request: AuthRequest) {
    return this.entitlements.rebuild(
      request.user.accountId,
    );
  }
}
