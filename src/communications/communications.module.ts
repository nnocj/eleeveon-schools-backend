import { Module } from "@nestjs/common";
import { PaymentGatewayModule } from "../payment-gateway/payment-gateway.module";
import { CommunicationsController } from "./communications.controller";
import { CommunicationsService } from "./communications.service";

@Module({
  imports: [PaymentGatewayModule],
  controllers: [CommunicationsController],
  providers: [CommunicationsService],
  exports: [CommunicationsService],
})
export class CommunicationsModule {}
