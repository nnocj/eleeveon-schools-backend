import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionChangeService } from "./subscription-change.service";

@Injectable()
export class SubscriptionJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: SubscriptionChangeService,
  ) {}

  async expireStaleQuotes(now: Date = new Date()) {
    return this.prisma.subscriptionChangeOrder.updateMany({
      where: {
        status: { in: ["quoted", "payment_pending"] },
        quoteExpiresAt: { lte: now },
      },
      data: { status: "expired" },
    });
  }

  async applyDueScheduledChanges(now: Date = new Date()) {
    const due = await this.prisma.subscriptionChangeOrder.findMany({
      where: { status: "scheduled", effectiveAt: { lte: now } },
      select: { id: true },
      take: 100,
      orderBy: { effectiveAt: "asc" },
    });

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const item of due) {
      try {
        await this.changes.applyPaidChangeOrder(item.id);
        results.push({ id: item.id, ok: true });
      } catch (error) {
        results.push({
          id: item.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results;
  }

  async updateExpiredSubscriptions(now: Date = new Date()) {
    return this.prisma.accountSubscription.updateMany({
      where: {
        status: { in: ["active", "grace", "past_due"] },
        currentPeriodEnd: { lte: now },
        OR: [{ graceEndsAt: null }, { graceEndsAt: { lte: now } }],
      },
      data: { status: "expired" },
    });
  }

  async runMaintenance(now: Date = new Date()) {
    const [quotes, scheduled, subscriptions] = await Promise.all([
      this.expireStaleQuotes(now),
      this.applyDueScheduledChanges(now),
      this.updateExpiredSubscriptions(now),
    ]);
    return { quotes, scheduled, subscriptions, ranAt: now };
  }
}
