import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";

/**
 * Recover committed subscription changes whose entitlement cache was not
 * rebuilt (for example, after a process crash between commit and rebuild).
 *
 * The database subscription is the source of truth. This job never marks a
 * payment as paid, never applies an order, and never creates a subscription.
 * It is observe-only unless explicitly enabled.
 */
@Injectable()
export class EntitlementRepairService {
  private readonly logger = new Logger(EntitlementRepairService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async process(
    mode: "observe" | "enforce" = "observe",
    limit = 100,
  ) {
    const orders = await this.prisma.subscriptionChangeOrder.findMany({
      where: { status: "applied", appliedAt: { not: null } },
      orderBy: { appliedAt: "desc" },
      take: Math.max(1, Math.min(500, limit)),
      select: {
        id: true, accountId: true, toPlanId: true,
        appliedAt: true, newPeriodStart: true, newPeriodEnd: true,
      },
    });
    const results: Array<{
      accountId: string; orderId: string;
      status: "healthy" | "stale" | "repaired" | "superseded" | "failed";
      error?: string;
    }> = [];

    for (const order of orders) {
      try {
        const [subscription, entitlement] = await Promise.all([
          this.prisma.accountSubscription.findUnique({
            where: { accountId: order.accountId },
            select: {
              id: true, planId: true,
              currentPeriodStart: true, currentPeriodEnd: true,
            },
          }),
          this.prisma.accountEntitlement.findUnique({
            where: { accountId: order.accountId },
            select: { rebuiltAt: true, subscriptionId: true, planId: true, perpetualLicenseId: true },
          }),
        ]);

        // Never let an older paid order overwrite a newer subscription state.
        const isCurrent = Boolean(subscription &&
          subscription.planId === order.toPlanId &&
          subscription.currentPeriodStart?.getTime() === order.newPeriodStart.getTime() &&
          subscription.currentPeriodEnd?.getTime() === order.newPeriodEnd.getTime());
        if (!isCurrent) {
          results.push({ accountId: order.accountId, orderId: order.id, status: "superseded" });
          continue;
        }

        // A perpetual license may legitimately be the selected entitlement;
        // rebuild freshness is still established by rebuiltAt, not a forced
        // subscriptionId equality (which would cause permanent repeat loops).
        const stale = !entitlement || !order.appliedAt ||
          entitlement.rebuiltAt.getTime() < order.appliedAt.getTime() ||
          (!entitlement.perpetualLicenseId &&
            (entitlement.subscriptionId !== subscription!.id || entitlement.planId !== subscription!.planId));
        if (!stale) {
          results.push({ accountId: order.accountId, orderId: order.id, status: "healthy" });
          continue;
        }

        if (mode === "observe") {
          this.logger.warn(`Entitlement rebuild needed account=${order.accountId} order=${order.id}`);
          results.push({ accountId: order.accountId, orderId: order.id, status: "stale" });
          continue;
        }

        // Re-check after the read to avoid applying obsolete orders where a
        // subscription changed while this batch was being examined.
        const fresh = await this.prisma.accountSubscription.findUnique({
          where: { accountId: order.accountId },
          select: { planId: true, currentPeriodStart: true, currentPeriodEnd: true },
        });
        if (!fresh || fresh.planId !== order.toPlanId ||
            fresh.currentPeriodStart?.getTime() !== order.newPeriodStart.getTime() ||
            fresh.currentPeriodEnd?.getTime() !== order.newPeriodEnd.getTime()) {
          results.push({ accountId: order.accountId, orderId: order.id, status: "superseded" });
          continue;
        }

        await this.entitlements.rebuild(order.accountId);
        results.push({ accountId: order.accountId, orderId: order.id, status: "repaired" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Entitlement repair failed account=${order.accountId} order=${order.id}: ${message}`);
        results.push({ accountId: order.accountId, orderId: order.id, status: "failed", error: message });
      }
    }
    return results;
  }
}
