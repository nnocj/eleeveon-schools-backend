import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PaymentGatewayModule } from "../payment-gateway/payment-gateway.module";
import { PayrollController } from "./payroll.controller";
import { PayrollService } from "./payroll.service";

@Module({
  imports: [AuthModule, PaymentGatewayModule],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}