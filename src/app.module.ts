
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

// Core platform
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { AccountsModule } from "./accounts/accounts.module";
import { MembershipsModule } from "./memberships/memberships.module";
import { PermissionsModule } from "./permissions/permissions.module";
import { EntitlementsModule } from "./entitlements";

// Business and finance
import { BillingModule } from "./billing/billing.module";
import { FinanceModule } from "./finance/finance.module";
import { PaymentGatewayModule } from "./payment-gateway/payment-gateway.module";
import { PayrollModule } from "./payroll/payroll.module";

// Platform services
import { MediaModule } from "./media/media.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { SyncModule } from "./sync/sync.module";
import { IdentityModule } from "./identity/identity.module";
import { PublicWebsitesModule } from "./public-websites/public-websites.module";

// Eleeveon Hub
import { SupportModule } from "./support/support.module";

@Module({
  imports: [
    // Global environment configuration
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Core platform
    PrismaModule,
    AuthModule,
    AccountsModule,
    MembershipsModule,
    PermissionsModule,
    EntitlementsModule,

    // Business and finance
    BillingModule,
    FinanceModule,
    PaymentGatewayModule,
    PayrollModule,

    // Platform services
    MediaModule,
    RealtimeModule,
    SyncModule,
    IdentityModule,
    PublicWebsitesModule,

    // Hub: chat, devices, history, surveys, calls, backgrounds
    SupportModule,
  ],
})
export class AppModule {}
