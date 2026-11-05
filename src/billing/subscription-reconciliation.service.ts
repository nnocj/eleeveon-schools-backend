import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";

/**
 * Stage 5: subscription lifecycle reconciliation.
 * Trial expiry is independently bounded by trialEndsAt. No conversion or payment
 * is performed by this service. The scheduled job is observe-only by default.
 */
@Injectable()
export class SubscriptionReconciliationService {
  private readonly logger = new Logger(SubscriptionReconciliationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async reconcileAccount(accountId: string, options: { observeOnly?: boolean } = {}) {
    const subscription = await this.prisma.accountSubscription.findUnique({
      where: { accountId },
    });
    if (!subscription) return { accountId, status: "no_subscription", changed: false };

    const now = new Date();
    const previousStatus = subscription.status;
    let status = previousStatus;
    // Do not allow a stale cancelled/expired record to be reactivated here.
    if (previousStatus === "trial") {
      // A trial without a recorded end is not silently given a fabricated end.
      if (subscription.trialEndsAt && subscription.trialEndsAt <= now) {
        status = "expired";
      }
    } else if (["active", "grace"].includes(previousStatus)) {
      if (subscription.currentPeriodEnd && subscription.currentPeriodEnd <= now) {
        status = subscription.graceEndsAt && subscription.graceEndsAt > now
          ? "grace"
          : "expired";
      }
    }

    if (status === previousStatus) {
      return { accountId, status, changed: false };
    }
    if (options.observeOnly) {
      this.logger.log(`Subscription reconciliation observation: account=${accountId} ${previousStatus}->${status}`);
      return { accountId, status: previousStatus, prospectiveStatus: status, changed: false, observeOnly: true };
    }

    // Compare-and-set protects a trial upgraded or converted while the job was running.
    const result = await this.prisma.accountSubscription.updateMany({
      where: {
        id: subscription.id,
        status: previousStatus,
        ...(previousStatus === "trial"
          ? { trialEndsAt: { lte: now } }
          : { currentPeriodEnd: { lte: now } }),
      },
      data: { status, entitlementVersion: { increment: 1 } },
    });
    if (!result.count) {
      const fresh = await this.prisma.accountSubscription.findUnique({ where: { accountId } });
      return { accountId, status: fresh?.status ?? "unknown", changed: false, raced: true };
    }
    await this.entitlements.rebuild(accountId);
    return { accountId, status, changed: true };
  }

  async processDueTrials(at = new Date(), mode: "observe" | "enforce" = "observe", limit = 100) {
    const due = await this.prisma.accountSubscription.findMany({
      where: { status: "trial", trialEndsAt: { lte: at } },
      orderBy: { trialEndsAt: "asc" },
      take: Math.max(1, Math.min(500, limit)),
      select: { accountId: true },
    });
    const results: Array<{ accountId: string; status: string; changed: boolean; error?: string }> = [];
    for (const item of due) {
      try {
        const result = await this.reconcileAccount(item.accountId, { observeOnly: mode !== "enforce" });
        results.push({ accountId: item.accountId, status: result.status, changed: result.changed });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Trial reconciliation failure account=${item.accountId}: ${message}`);
        results.push({ accountId: item.accountId, status: "error", changed: false, error: message });
      }
    }
    return results;
  }
}
