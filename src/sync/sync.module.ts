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

import { AdmissionNumberService } from "../admissions/admission-number.service";

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
  AdmissionNumberService,
],
  exports: [
    SyncService,
    SubscriptionSyncPolicyService,
  ],
})
export class SyncModule {}
