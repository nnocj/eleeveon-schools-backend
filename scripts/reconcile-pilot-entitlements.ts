/**
 * One-time targeted entitlement reconciliation.
 * Run from the backend project root:
 *   npx ts-node scripts/reconcile-pilot-entitlements.ts
 *   npx ts-node scripts/reconcile-pilot-entitlements.ts --apply
 *
 * Preview is read-only. --apply writes AccountEntitlement + AccountUsageSnapshot
 * using the application's existing EntitlementsService.
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Module } from "@nestjs/common";
import { PrismaModule } from "../src/prisma/prisma.module";
import { EntitlementResolverService } from "../src/entitlements/entitlement-resolver.service";
import { EntitlementPolicyService } from "../src/entitlements/entitlement-policy.service";
import { UsageService } from "../src/entitlements/usage.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { EntitlementsService } from "../src/entitlements/entitlements.service";

// Minimal one-time context: deliberately avoids Identity, Billing, Hub, etc.
@Module({
  imports: [PrismaModule],
  providers: [
    EntitlementPolicyService,
    EntitlementResolverService,
    UsageService,
    EntitlementsService,
  ],
})
class ReconciliationModule {}

const TARGETS = [
  {
    accountId: "d1ddad9c-ade3-435b-93a0-790b6ace15d8",
    email: "joeracleschool@gmail.com",
    planCode: "sp002",
    subscriptionStatus: "trial",
  },
  {
    accountId: "f7918619-25e2-4504-b814-e58ae2b07fb5",
    email: "steveamoako29@gmail.com",
    planCode: "sp005",
    subscriptionStatus: "active",
  },
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const app = await NestFactory.createApplicationContext(ReconciliationModule, {
    logger: ["error", "warn"],
  });

  try {
    const prisma = app.get(PrismaService);
    const entitlements = app.get(EntitlementsService);
    const previews: Array<{
      accountId: string;
      school: string;
      plan: string;
      status: string;
      students: number;
      limit: number | null;
      existingSnapshot: boolean;
      expectedEnd: string | null;
    }> = [];

    for (const target of TARGETS) {
      const account = await prisma.account.findUnique({
        where: { id: target.accountId },
        select: { id: true, name: true, email: true },
      });
      if (!account || account.email?.toLowerCase() !== target.email) {
        throw new Error(`Account identity mismatch: ${target.accountId}`);
      }

      const subscription = await prisma.accountSubscription.findUnique({
        where: { accountId: target.accountId },
        include: { plan: true },
      });
      if (
        !subscription ||
        subscription.plan.code !== target.planCode ||
        subscription.status !== target.subscriptionStatus ||
        !subscription.plan.active
      ) {
        throw new Error(`Unexpected subscription or plan for ${account.name}`);
      }
      if (
        target.planCode === "sp002" &&
        (!subscription.trialEndsAt || subscription.trialEndsAt <= new Date())
      ) {
        throw new Error("Joeracle trial has no future expiry; aborting.");
      }
      if (
        target.planCode === "sp005" &&
        (subscription.currentPeriodEnd !== null || subscription.trialEndsAt !== null)
      ) {
        throw new Error("Pilot School has an unexpected expiry; aborting.");
      }

      const [students, existing] = await Promise.all([
        prisma.syncRecord.count({
          where: {
            accountId: target.accountId,
            tableName: "students",
            isDeleted: false,
          },
        }),
        prisma.accountEntitlement.findUnique({
          where: { accountId: target.accountId },
        }),
      ]);
      if (subscription.plan.maxStudents != null && students > subscription.plan.maxStudents) {
        throw new Error(`${account.name}: ${students} students exceed plan cap ${subscription.plan.maxStudents}`);
      }
      previews.push({
        accountId: account.id,
        school: account.name,
        plan: subscription.plan.code,
        status: subscription.status,
        students,
        limit: subscription.plan.maxStudents,
        existingSnapshot: !!existing,
        expectedEnd: subscription.trialEndsAt?.toISOString() ?? null,
      });
    }

    console.table(previews);
    if (!apply) {
      console.log("DRY RUN: no changes made. Run again with --apply to rebuild both.");
      return;
    }

    // Deliberately no blanket rebuild: only the two explicitly approved account IDs.
    for (const target of TARGETS) {
      const access = await entitlements.rebuild(target.accountId);
      const snapshot = await prisma.accountEntitlement.findUniqueOrThrow({
        where: { accountId: target.accountId },
      });
      if (snapshot.planId !== (await prisma.accountSubscription.findUniqueOrThrow({
        where: { accountId: target.accountId }, select: { planId: true },
      })).planId) {
        throw new Error(`Post-rebuild plan mismatch for ${target.email}`);
      }
      console.log(JSON.stringify({
        account: target.email,
        entitlementId: snapshot.id,
        status: snapshot.status,
        licenseModel: snapshot.licenseModel,
        maxStudents: snapshot.maxStudents,
        validUntil: snapshot.validUntil,
        syncPolicy: snapshot.syncPolicy,
        deploymentMode: snapshot.deploymentMode,
        version: snapshot.version,
        accessResolved: !!access,
      }, null, 2));
    }
    console.log("Reconciliation complete. Verify records using the SQL in README.md.");
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
