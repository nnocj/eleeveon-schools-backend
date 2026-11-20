import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { IdentityController, PublicIdentityController } from "./identity.controller";
import { IdentityService } from "./identity.service";
import { IndependentIdentityService } from "./independent-identity.service";

@Module({
  imports: [PrismaModule],
  controllers: [IdentityController, PublicIdentityController],
  providers: [IdentityService, IndependentIdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
