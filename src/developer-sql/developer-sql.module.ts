import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DeveloperSqlController } from "./developer-sql.controller";
import { DeveloperSqlService } from "./developer-sql.service";

@Module({
  imports: [PrismaModule],
  controllers: [DeveloperSqlController],
  providers: [DeveloperSqlService],
  exports: [DeveloperSqlService],
})
export class DeveloperSqlModule {}
