import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PaymentGatewayModule } from "../payment-gateway/payment-gateway.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";

@Module({
  imports: [AuthModule, PaymentGatewayModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}