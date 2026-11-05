import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { parseStudentPricing, calculateStudentQuote } from "./student-pricing";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionCalculatorService } from "./subscription-calculator.service";
import type { BillingCycle } from "./types/subscription.types";
import { BadRequestException } from "@nestjs/common";

@Injectable()
export class PricingResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: SubscriptionCalculatorService,
  ) {}

  async resolve(input: {
    accountId: string;
    planId: string;
    billingCycle: BillingCycle;
    privateOfferCode?: string;
    pricingOverrideId?: string;
    at?: Date;
  }) {
    const at = input.at ?? new Date();

    const plan =
      await this.prisma.subscriptionPlan.findUnique({
        where: { id: input.planId },
      });

    if (!plan || !plan.active) {
      throw new NotFoundException(
        "Subscription plan not found or inactive.",
      );
    }

    const [assignment, override] =
      await Promise.all([
        input.privateOfferCode
          ? this.prisma.privateOfferAssignment.findFirst({
              where: {
                accountId: input.accountId,
                status: {
                  in: [
                    "assigned",
                    "active",
                    "redeemed",
                  ],
                },
                offer: {
                  code: input.privateOfferCode,
                  active: true,
                  basePlanId: input.planId,
                },
                OR: [
                  { validFrom: null },
                  { validFrom: { lte: at } },
                ],
                AND: [
                  {
                    OR: [
                      { validUntil: null },
                      { validUntil: { gt: at } },
                    ],
                  },
                ],
              },
              include: { offer: true },
            })
          : null,
        input.pricingOverrideId
          ? this.prisma.accountPricingOverride.findFirst({
              where: {
                id: input.pricingOverrideId,
                accountId: input.accountId,
                planId: input.planId,
                active: true,
              },
            })
          : this.prisma.accountPricingOverride.findFirst({
              where: {
                accountId: input.accountId,
                planId: input.planId,
                active: true,
                OR: [
                  { validFrom: null },
                  { validFrom: { lte: at } },
                ],
                AND: [
                  {
                    OR: [
                      { validUntil: null },
                      { validUntil: { gt: at } },
                    ],
                  },
                ],
              },
              orderBy: { updatedAt: "desc" },
            }),
      ]);

    // Commercial billing is based on current, account-scoped cloud student records.
    // Match the Stage 4 sync quota count: distinct live student identities,
    // not copies of the same student on multiple devices.
    let studentPricing;
    try {
      studentPricing = parseStudentPricing(plan.metadata);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    if (studentPricing.mode !== "fixed") {
      if (plan.licenseModel !== "subscription" || plan.deploymentMode !== "eleeveon_cloud") {
        throw new BadRequestException("This plan needs a separate license purchase workflow.");
      }
      if (studentPricing.billingPeriod !== input.billingCycle) {
        throw new BadRequestException("Select the plan's configured student-pricing billing period.");
      }
      if (input.privateOfferCode || input.pricingOverrideId || assignment || override) {
        throw new BadRequestException("Student-priced custom offers are not yet supported by verified checkout.");
      }
    }

    let studentCount: number | undefined;
    let listAmount: number;
    if (studentPricing.mode !== "fixed") {
      const rows = await this.prisma.syncRecord.findMany({
        where: { accountId: input.accountId, tableName: "students", isDeleted: false },
        select: { localId: true, payload: true },
      });
      const ids = new Set<string>();
      for (const row of rows) {
        const payload = (row.payload && typeof row.payload === "object" && !Array.isArray(row.payload))
          ? row.payload as Record<string, unknown> : {};
        // Match the Stage 4 server limit count, which excludes only
        // SyncRecord tombstones. A status change alone is not a deletion.
        const studentId = String(payload.id || row.localId || "").trim();
        if (studentId) ids.add(studentId);
      }
      studentCount = ids.size;
      if (!studentCount) {
        throw new BadRequestException("No active synchronized students are available for an authoritative quote. Synchronize admissions first.");
      }
      if (plan.maxStudents !== null && studentCount > plan.maxStudents) {
        throw new BadRequestException("Student count exceeds this plan's maximum. Choose a suitable plan.");
      }
      listAmount = calculateStudentQuote(studentPricing, studentCount);
      // SubscriptionChangeOrder amounts are Prisma Int and represent whole GHS.
      // Avoid silent truncation or unintended fractional billing.
      if (!Number.isSafeInteger(listAmount)) {
        throw new BadRequestException("This plan's calculated amount is not a whole Ghana cedi. Update pricing before checkout.");
      }
    } else {
      listAmount = this.calculator.priceForCycle(plan, input.billingCycle);
    }

    const offerPrice = assignment?.offer
      ? this.explicitPrice(
          assignment.offer,
          input.billingCycle,
        )
      : undefined;

    const overridePrice = override
      ? this.explicitPrice(
          override,
          input.billingCycle,
        )
      : undefined;

    const baseAmount =
      overridePrice ??
      offerPrice ??
      listAmount;

    const discountSource =
      override ?? assignment?.offer;

    const discountAmount =
      this.calculator.applyDiscount(
        baseAmount,
        discountSource?.discountType,
        discountSource?.discountValue,
      );

    return {
      plan,
      studentCount,
      studentPricingMode: studentPricing.mode,
      privateOfferAssignment: assignment,
      pricingOverride: override,
      currency:
        override?.currency ??
        assignment?.offer.currency ??
        plan.currency,
      listAmount,
      baseAmount,
      discountAmount,
    };
  }

  private explicitPrice(
    source: {
      priceMonthly?: number | null;
      priceTermly?: number | null;
      priceYearly?: number | null;
    },
    billingCycle: BillingCycle,
  ): number | undefined {
    const value =
      billingCycle === "monthly"
        ? source.priceMonthly
        : billingCycle === "termly"
          ? source.priceTermly
          : billingCycle === "yearly"
            ? source.priceYearly
            : undefined;

    return typeof value === "number"
      ? value
      : undefined;
  }
}
