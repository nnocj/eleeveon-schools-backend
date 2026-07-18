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