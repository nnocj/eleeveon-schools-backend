import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

type ReconciledSubscription =
  Prisma.AccountSubscriptionGetPayload<Record<string, never>>;

type ReconcileAccountResult =
  | {
      accountId: string;
      changed: false;
      reason: "No subscription.";
    }
  | {
      accountId: string;
      changed: false;
      status: string;
    }
  | {
      accountId: string;
      changed: true;
      updates: Prisma.AccountSubscriptionUncheckedUpdateInput;
      subscription: ReconciledSubscription;
    };

@Injectable()
export class SubscriptionReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async reconcileAccount(
    accountId: string,
  ): Promise<ReconcileAccountResult> {
    const subscription =
      await this.prisma.accountSubscription.findUnique({
        where: { accountId },
        include: {
          plan: true,
          periods: {
            orderBy: { endsAt: "desc" },
            take: 5,
          },
          changeOrders: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });

    if (!subscription) {
      return {
        accountId,
        changed: false,
        reason: "No subscription.",
      };
    }

    const now = new Date();

    const activePeriod = subscription.periods.find(
      (period) =>
        period.startsAt <= now &&
        period.endsAt > now,
    );

    const desiredStatus = activePeriod
      ? "active"
      : subscription.graceEndsAt &&
          subscription.graceEndsAt > now
        ? "grace"
        : subscription.currentPeriodEnd &&
            subscription.currentPeriodEnd <= now
          ? "expired"
          : subscription.status;

    const updates: Prisma.AccountSubscriptionUncheckedUpdateInput =
      {};

    if (desiredStatus !== subscription.status) {
      updates.status = desiredStatus;
    }

    if (activePeriod) {
      if (
        subscription.currentPeriodStart?.getTime() !==
        activePeriod.startsAt.getTime()
      ) {
        updates.currentPeriodStart =
          activePeriod.startsAt;
      }

      if (
        subscription.currentPeriodEnd?.getTime() !==
        activePeriod.endsAt.getTime()
      ) {
        updates.currentPeriodEnd =
          activePeriod.endsAt;
        updates.nextBillingDate =
          activePeriod.endsAt;
      }

      if (
        subscription.planId !== activePeriod.planId
      ) {
        updates.planId = activePeriod.planId;
      }

      if (
        subscription.billingCycle !==
        activePeriod.billingCycle
      ) {
        updates.billingCycle =
          activePeriod.billingCycle;
      }
    }

    if (!Object.keys(updates).length) {
      return {
        accountId,
        changed: false,
        status: subscription.status,
      };
    }

    const updated =
      await this.prisma.accountSubscription.update({
        where: { id: subscription.id },
        data: updates,
      });

    return {
      accountId,
      changed: true,
      updates,
      subscription: updated,
    };
  }

  async reconcileAll(
    limit = 100,
  ): Promise<ReconcileAccountResult[]> {
    const accounts =
      await this.prisma.accountSubscription.findMany({
        select: {
          accountId: true,
        },
        take: Math.max(
          1,
          Math.min(limit, 1000),
        ),
        orderBy: {
          updatedAt: "asc",
        },
      });

    const results: ReconcileAccountResult[] = [];

    for (const account of accounts) {
      const result =
        await this.reconcileAccount(
          account.accountId,
        );

      results.push(result);
    }

    return results;
  }
}
