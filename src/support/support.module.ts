import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";
import { SupportStorageService } from "./support-storage.service";

@Module({
  imports: [PrismaModule],
  controllers: [SupportController],
  providers: [SupportService, SupportStorageService],
})
export class SupportModule {}
