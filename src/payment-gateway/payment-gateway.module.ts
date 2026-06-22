import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PaymentGatewayController } from "./payment-gateway.controller";
import { PaymentGatewayService } from "./payment-gateway.service";
import { RecordStoreService } from "./record-store.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PaymentGatewayController],
  providers: [PaymentGatewayService, RecordStoreService],
  exports: [PaymentGatewayService, RecordStoreService],
})
export class PaymentGatewayModule {}