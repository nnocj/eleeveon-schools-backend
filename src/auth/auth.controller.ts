import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  AuthService,
  type AuthenticatedSessionActor,
} from "./auth.service";

import {
  LoginDto,
  RegisterDto,
} from "./dto/auth.dto";

import {
  JwtAuthGuard,
} from "./jwt-auth.guard";

type AuthenticatedRequest = {
  user:
    AuthenticatedSessionActor;
};

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService:
      AuthService,
  ) {}

  @Post("register")
  register(
    @Body() dto: RegisterDto,
  ) {
    return this.authService.register(
      dto,
    );
  }

  @Post("login")
  login(
    @Body() dto: LoginDto,
  ) {
    return this.authService.login(
      dto,
    );
  }

  /**
   * Opt-in, additive discovery contract for unified Cloud/Independent routing.
   * Not an authorization grant: protected APIs must validate entitlements
   * and active memberships independently on every request.
   */
  @UseGuards(JwtAuthGuard)
  @Get("deployment-context")
  deploymentContext(@Req() req: AuthenticatedRequest) {
    return this.authService.deploymentContext(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(
    @Req()
    req: AuthenticatedRequest,
  ) {
    /**
     * JwtStrategy already loaded and validated the lightweight session.
     * Do not query the same user again.
     */
    return this.authService.me(
      req.user,
    );
  }
}