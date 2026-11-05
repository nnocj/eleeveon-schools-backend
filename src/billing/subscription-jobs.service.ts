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

  /** Opt in only after Stage 1 payment/tenant regression tests pass. */
  @Cron("*/15 * * * *")
  async recoverConfirmedPayments() {
    if (process.env.COMMERCIAL_RECOVERY_ENABLED !== "true") return;
    try {
      const report = await this.reconciliation.recoverConfirmedChanges({
        limit: 25,
        dryRun: false,
      });
      const failed = report.results.filter((entry) => entry.result === "failed").length;
      if (report.scanned) {
        this.logger.log(`Commercial recovery scanned ${report.scanned} order(s); ${failed} failed.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Commercial recovery cycle failed: ${message}`);
    }
  }
}
