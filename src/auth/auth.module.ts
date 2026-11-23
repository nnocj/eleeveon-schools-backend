import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { DurableSessionService } from "./durable-session.service";
import { OfflineGrantService } from "./offline-grant.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { EntitlementsModule } from "../entitlements/entitlements.module";

@Module({
  imports: [
    EntitlementsModule,
    PassportModule.register({
      defaultStrategy: "jwt",
    }),

    JwtModule.register({}),
  ],

  controllers: [
    AuthController,
  ],

  providers: [
    AuthService,
    DurableSessionService,
    OfflineGrantService,
    JwtStrategy,
  ],

  exports: [
    AuthService,
    JwtModule,
    PassportModule,
  ],
})
export class AuthModule {}