import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { SubscriptionChangeService } from "./subscription-change.service";

/**
 * Recover only already-confirmed paid changes. Never infer payment success from
 * a webhook payload or from a change-order status alone.
 */
@Injectable()
export class SubscriptionReconciliationService {
  private readonly logger = new Logger(SubscriptionReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly changes: SubscriptionChangeService,
  ) {}

  /** Existing API: keep the previously supported account-state reconciliation. */
  async reconcileAccount(accountId: string) {
    const subscription = await this.prisma.accountSubscription.findUnique({
      where: { accountId },
    });
    if (!subscription) return { accountId, status: "no_subscription" };

    const now = new Date();
    let status = subscription.status;
    if (subscription.currentPeriodEnd && subscription.currentPeriodEnd <= now) {
      status = subscription.graceEndsAt && subscription.graceEndsAt > now
        ? "grace"
        : "expired";
    }
    if (status !== subscription.status) {
      await this.prisma.accountSubscription.update({
        where: { accountId },
        data: { status },
      });
    }
    await this.entitlements.rebuild(accountId);
    return { accountId, status };
  }

  /**
   * A bounded, safe-to-repeat scan. It does NOT re-query providers, create
   * payments, issue licences or apply delayed period-end changes.
   *
   * Rebuilds snapshots only for already-applied orders whose account's current
   * subscription still points at that exact resulting plan; this avoids
   * clobbering a later purchase or an independent licence.
   */
  async recoverConfirmedChanges(options: { limit?: number; dryRun?: boolean } = {}) {
    const limit = Math.max(1, Math.min(100, options.limit ?? 25));
    const dryRun = options.dryRun ?? true;
    const now = new Date();
    const orders = await this.prisma.subscriptionChangeOrder.findMany({
      where: {
        amountDue: { gt: 0 },
        status: { in: ["paid", "payment_pending"] },
        effectiveMode: "immediate",
        effectiveAt: { lte: now },
        payment: { is: { status: "paid" } },
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
      include: { payment: true },
    });

    const results: Array<{ orderId: string; accountId: string; result: string; reason?: string }> = [];
    for (const order of orders) {
      // Defensive checks against cross-tenant links, changed amounts and
      // cancelled orders. Only backend-verified paid payments qualify.
      if (!order.payment ||
          order.payment.accountId !== order.accountId ||
          order.payment.id !== order.paymentId ||
          order.payment.status !== "paid" ||
          order.payment.currency.toUpperCase() !== order.currency.toUpperCase() ||
          Number(order.payment.amount) !== Number(order.amountDue)) {
        results.push({ orderId: order.id, accountId: order.accountId, result: "skipped", reason: "linked payment mismatch" });
        continue;
      }
      if (dryRun) {
        results.push({ orderId: order.id, accountId: order.accountId, result: "would_retry" });
        continue;
      }
      try {
        await this.changes.applyPaidChangeOrder(order.id);
        results.push({ orderId: order.id, accountId: order.accountId, result: "applied" });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "unknown error";
        this.logger.warn(`Commercial recovery failed for order ${order.id}: ${reason}`);
        results.push({ orderId: order.id, accountId: order.accountId, result: "failed", reason });
      }
    }
    return { dryRun, scanned: orders.length, results };
  }
}
