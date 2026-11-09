import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { parseStudentPricing } from "./student-pricing";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  SubscriptionChangeService,
} from "./subscription-change.service";

import type {
  BillingCycle,
} from "./types/subscription.types";

type RenewalProcessingResult =
  | {
      accountId: string;
      orderId: string;
      status: "quoted";
    }
  | {
      accountId: string;
      status: "observed";
    }
  | {
      accountId: string;
      status: "failed";
      error: string;
    };

@Injectable()
export class SubscriptionRenewalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: SubscriptionChangeService,
  ) {}

  async quoteRenewal(accountId: string) {
    const subscription =
      await this.prisma.accountSubscription.findUnique({
        where: { accountId },
      });

    if (!subscription) {
      throw new NotFoundException(
        "Account subscription not found.",
      );
    }

    // A renewal should not create additional invoices while a quotation or
    // payment for this exact billing boundary is still unresolved.
    const existing = await this.prisma.subscriptionChangeOrder.findFirst({
      where: {
        accountId,
        changeType: "renewal",
        toPlanId: subscription.planId,
        oldPeriodEnd: subscription.currentPeriodEnd,
        status: { in: ["quoted", "checkout_initializing", "payment_pending", "paid", "applied", "scheduled"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return existing;
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: subscription.planId }, select: { metadata: true },
    });
    if (!plan) throw new NotFoundException("Subscription plan not found.");
    const studentPriced = parseStudentPricing(plan.metadata).mode !== "fixed";
    // Student-priced quotes are payable only for an immediate activation.
    return this.changes.createOrder(
      accountId,
      {
        toPlanId: subscription.planId,
        billingCycle:
          subscription.billingCycle as BillingCycle,
        changeType: "renewal",
        effectiveMode: studentPriced ? "immediate" : "period_end",
      },
    );
  }

  async processDueRenewals(
    at = new Date(),
    mode: "observe" | "enforce" = "observe",
  ): Promise<RenewalProcessingResult[]> {
    const due =
      await this.prisma.accountSubscription.findMany({
        where: {
          autoRenew: true,
          status: {
            in: ["active", "grace"],
          },
          nextBillingDate: {
            lte: at,
          },
        },
      });

    const results: RenewalProcessingResult[] = [];

    for (const subscription of due) {
      try {
        if (mode === "observe") {
          results.push({ accountId: subscription.accountId, status: "observed" });
          continue;
        }
        const order = await this.quoteRenewal(subscription.accountId);
        results.push({ accountId: subscription.accountId, orderId: order.id, status: "quoted" });
      } catch (error) {
        results.push({
          accountId: subscription.accountId,
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }

    return results;
  }
}