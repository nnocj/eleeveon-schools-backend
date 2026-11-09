import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SubscriptionRenewalService } from "./subscription-renewal.service";
import { SubscriptionReconciliationService } from "./subscription-reconciliation.service";
import { EntitlementRepairService } from "./entitlement-repair.service";

@Injectable()
export class SubscriptionJobsService {
  private readonly logger = new Logger(SubscriptionJobsService.name);
  constructor(
    private readonly renewals: SubscriptionRenewalService,
    private readonly reconciliation: SubscriptionReconciliationService,
    private readonly entitlementRepair: EntitlementRepairService,
  ) {}

  @Cron("0 5 * * *")
  async processRenewals() {
    const mode: "observe" | "enforce" = process.env.SUBSCRIPTION_RENEWAL_JOB_MODE === "enforce" ? "enforce" : "observe";
    const result = await this.renewals.processDueRenewals(new Date(), mode);
    this.logger.log(`Subscription renewals ${mode}: due=${result.length} failed=${result.filter(r => r.status === "failed").length}`);
  }

  /** The Stage 5 lifecycle job is safe to deploy before activating expiry. */
  @Cron("15 5 * * *")
  async processTrials() {
    const mode: "observe" | "enforce" =
      process.env.TRIAL_EXPIRATION_JOB_MODE === "enforce" ? "enforce" : "observe";
    const results = await this.reconciliation.processDueTrials(new Date(), mode);
    this.logger.log(`Trial expiry ${mode}: found=${results.length} changed=${results.filter(r => r.changed).length} errors=${results.filter(r => r.error).length}`);
  }
  /** Crash recovery: observe first; enable only after staging verification. */
  @Cron("45 5 * * *")
  async repairEntitlements() {
    const mode: "observe" | "enforce" = process.env.ENTITLEMENT_REPAIR_JOB_MODE === "enforce" ? "enforce" : "observe";
    const results = await this.entitlementRepair.process(mode);
    this.logger.log(`Entitlement recovery ${mode}: checked=${results.length} stale=${results.filter(r => r.status === "stale").length} repaired=${results.filter(r => r.status === "repaired").length} failed=${results.filter(r => r.status === "failed").length}`);
  }
}
