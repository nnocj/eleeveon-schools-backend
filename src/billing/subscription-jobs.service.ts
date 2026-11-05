import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SubscriptionRenewalService } from "./subscription-renewal.service";
import { SubscriptionReconciliationService } from "./subscription-reconciliation.service";

@Injectable()
export class SubscriptionJobsService {
  private readonly logger = new Logger(SubscriptionJobsService.name);
  constructor(
    private readonly renewals: SubscriptionRenewalService,
    private readonly reconciliation: SubscriptionReconciliationService,
  ) {}

  @Cron("0 5 * * *")
  async processRenewals() {
    const result = await this.renewals.processDueRenewals();
    this.logger.log(`Processed ${result.length} due subscription renewals.`);
  }

  /** The Stage 5 lifecycle job is safe to deploy before activating expiry. */
  @Cron("15 5 * * *")
  async processTrials() {
    const mode: "observe" | "enforce" =
      process.env.TRIAL_EXPIRATION_JOB_MODE === "enforce" ? "enforce" : "observe";
    const results = await this.reconciliation.processDueTrials(new Date(), mode);
    this.logger.log(`Trial expiry ${mode}: found=${results.length} changed=${results.filter(r => r.changed).length} errors=${results.filter(r => r.error).length}`);
  }
}
