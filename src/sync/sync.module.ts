import {
  Module,
} from "@nestjs/common";

import {
  AuthModule,
} from "../auth/auth.module";

import {
  SyncController,
} from "./sync.controller";
import {
  SyncService,
} from "./sync.service";
import {
  SubscriptionSyncPolicyService,
} from "./subscription-sync-policy.service";

@Module({
  imports: [
    AuthModule,
  ],
  controllers: [
    SyncController,
  ],
  providers: [
    SyncService,
    SubscriptionSyncPolicyService,
  ],
  exports: [
    SyncService,
    SubscriptionSyncPolicyService,
  ],
})
export class SyncModule {}
