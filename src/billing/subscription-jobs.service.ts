import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SubscriptionRenewalService } from "./subscription-renewal.service";

@Injectable()
export class SubscriptionJobsService {
  private readonly logger =
    new Logger(SubscriptionJobsService.name);

  constructor(
    private readonly renewals: SubscriptionRenewalService,
  ) {}

  @Cron("0 5 * * *")
  async processRenewals() {
    const result =
      await this.renewals.processDueRenewals();

    this.logger.log(
      `Processed ${result.length} due subscription renewals.`,
    );
  }
}
