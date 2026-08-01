import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PublicWebsitesController } from "./public-websites.controller";
import { PublicWebsitesService } from "./public-websites.service";

@Module({
  imports: [PrismaModule],
  controllers: [PublicWebsitesController],
  providers: [PublicWebsitesService],
  exports: [PublicWebsitesService],
})
export class PublicWebsitesModule {}
