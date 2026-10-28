import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";
import { SupportStorageService } from "./support-storage.service";
import { SupportSurveysService } from "./support-surveys.service";
import { SupportLiveService } from "./support-live.service";
import { SupportDeviceLinksService } from "./support-device-links.service";
import { SupportBackgroundsService } from "./support-backgrounds.service";

@Module({
  imports: [PrismaModule],
  controllers: [SupportController],
  providers: [SupportService, SupportStorageService, SupportSurveysService, SupportLiveService, SupportDeviceLinksService, SupportBackgroundsService],
})
export class SupportModule {}
