import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AccountsModule } from "./accounts/accounts.module";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { FinanceModule } from "./finance/finance.module";
import { MembershipsModule } from "./memberships/memberships.module";
import { PaymentGatewayModule } from "./payment-gateway/payment-gateway.module";
import { PayrollModule } from "./payroll/payroll.module";
import { PermissionsModule } from "./permissions/permissions.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SyncModule } from "./sync/sync.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AccountsModule,
    MembershipsModule,
    BillingModule,
    FinanceModule,
    PaymentGatewayModule,
    PayrollModule,
    PermissionsModule,
    SyncModule,
  ],
})
export class AppModule {}