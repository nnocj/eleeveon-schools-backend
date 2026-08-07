import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";

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

    return this.changes.createOrder(
      accountId,
      {
        toPlanId: subscription.planId,
        billingCycle:
          subscription.billingCycle as BillingCycle,
        changeType: "renewal",
        effectiveMode: "period_end",
      },
    );
  }

  async processDueRenewals(
    at = new Date(),
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
        const order =
          await this.quoteRenewal(
            subscription.accountId,
          );

        results.push({
          accountId: subscription.accountId,
          orderId: order.id,
          status: "quoted",
        });
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