import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";

@Injectable()
export class SubscriptionReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async reconcileAccount(accountId: string) {
    const subscription =
      await this.prisma.accountSubscription.findUnique({
        where: { accountId },
      });

    if (!subscription) {
      return {
        accountId,
        status: "no_subscription",
      };
    }

    const now = new Date();
    let status = subscription.status;

    if (
      subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd <= now
    ) {
      if (
        subscription.graceEndsAt &&
        subscription.graceEndsAt > now
      ) {
        status = "grace";
      } else {
        status = "expired";
      }
    }

    if (status !== subscription.status) {
      await this.prisma.accountSubscription.update({
        where: { accountId },
        data: { status },
      });
    }

    await this.entitlements.rebuild(
      accountId,
    );

    return {
      accountId,
      status,
    };
  }
}
