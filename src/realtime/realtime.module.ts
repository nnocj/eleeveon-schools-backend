import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { RealtimeAuthGuard } from "./realtime-auth.guard";
import { RealtimeEventsService } from "./realtime-events.service";
import { RealtimeGateway } from "./realtime.gateway";

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET"),
      }),
    }),
  ],
  providers: [
    RealtimeAuthGuard,
    RealtimeEventsService,
    RealtimeGateway,
  ],
  exports: [RealtimeEventsService],
})
export class RealtimeModule {}