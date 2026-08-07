import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";

import type {
  CreateLicenseUpgradeOfferDto,
} from "./dto/create-upgrade-offer.dto";

@Injectable()
export class LicenseUpgradeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async createOffer(
    dto: CreateLicenseUpgradeOfferDto,
    requestedByUserId?: string,
  ) {
    const license =
      await this.prisma.perpetualLicense.findFirst({
        where: {
          id: dto.licenseId,
          accountId: dto.accountId,
        },
      });

    if (!license) {
      throw new NotFoundException(
        "Perpetual licence not found.",
      );
    }

    const amountDue = Math.max(
      0,
      dto.baseAmount -
        (dto.discountAmount ?? 0) -
        (dto.creditAmount ?? 0) +
        (dto.taxAmount ?? 0),
    );

    return this.prisma.licenseUpgradeOffer.create({
      data: {
        accountId: dto.accountId,
        licenseId: dto.licenseId,
        fromPlanId:
          dto.fromPlanId ?? license.planId,
        toPlanId: dto.toPlanId,
        upgradeType: dto.upgradeType,
        fromVersion:
          dto.fromVersion ??
          license.entitledVersion,
        toVersion: dto.toVersion,
        oldLimits:
          dto.oldLimits as Prisma.InputJsonValue,
        newLimits:
          dto.newLimits as Prisma.InputJsonValue,
        currency:
          dto.currency?.trim().toUpperCase() ??
          license.currency,
        baseAmount: dto.baseAmount,
        discountAmount:
          dto.discountAmount ?? 0,
        creditAmount:
          dto.creditAmount ?? 0,
        taxAmount: dto.taxAmount ?? 0,
        amountDue,
        status:
          amountDue === 0
            ? "paid"
            : "quoted",
        calculation: (dto.calculation ??
          {}) as Prisma.InputJsonValue,
        quoteExpiresAt:
          new Date(dto.quoteExpiresAt),
        paidAt:
          amountDue === 0
            ? new Date()
            : undefined,
        requestedByUserId,
        metadata:
          dto.metadata as Prisma.InputJsonValue,
      },
    });
  }

  async markPaymentPending(
    offerId: string,
    invoiceId: string,
    paymentId: string,
  ) {
    return this.prisma.licenseUpgradeOffer.update({
      where: { id: offerId },
      data: {
        status: "payment_pending",
        invoiceId,
        paymentId,
      },
    });
  }

  async markPaid(
    offerId: string,
    paymentId?: string,
  ) {
    return this.prisma.licenseUpgradeOffer.update({
      where: { id: offerId },
      data: {
        status: "paid",
        paidAt: new Date(),
        paymentId,
      },
    });
  }

  async apply(
    offerId: string,
    appliedByUserId?: string,
  ) {
    const offer =
      await this.prisma.licenseUpgradeOffer.findUnique({
        where: { id: offerId },
        include: {
          license: true,
          toPlan: true,
        },
      });

    if (!offer) {
      throw new NotFoundException(
        "Licence upgrade offer not found.",
      );
    }

    if (offer.status === "applied") {
      return offer;
    }

    if (
      offer.status !== "paid" &&
      offer.amountDue > 0
    ) {
      throw new BadRequestException(
        "Licence upgrade must be paid before it can be applied.",
      );
    }

    if (
      offer.quoteExpiresAt < new Date() &&
      offer.status !== "paid"
    ) {
      throw new BadRequestException(
        "Licence upgrade offer has expired.",
      );
    }

    const limits =
      this.numberMap(offer.newLimits);

    const updated =
      await this.prisma.$transaction(
        async (tx) => {
          if (
            offer.upgradeType ===
            "connected_migration"
          ) {
            await tx.perpetualLicense.update({
              where: { id: offer.licenseId },
              data: {
                status: "upgraded",
                upgradedAt: new Date(),
              },
            });
          } else {
            await tx.perpetualLicense.update({
              where: { id: offer.licenseId },
              data: {
                planId: offer.toPlanId,
                entitledVersion:
                  offer.toVersion ??
                  offer.license
                    .entitledVersion,
                licensedMajorVersion:
                  offer.toPlan
                    .licensedMajorVersion,
                maxSchools:
                  limits.schools ??
                  offer.license.maxSchools,
                maxBranches:
                  limits.branches ??
                  offer.license.maxBranches,
                maxUsers:
                  limits.users ??
                  offer.license.maxUsers,
                maxStudents:
                  limits.students ??
                  offer.license.maxStudents,
                maxTeachers:
                  limits.teachers ??
                  offer.license.maxTeachers,
                deviceLimit:
                  limits.devices ??
                  offer.license.deviceLimit,
                activationLimit:
                  limits.activations ??
                  offer.license
                    .activationLimit,
                syncPolicy:
                  offer.toPlan.syncPolicy ===
                  "disabled"
                    ? "disabled"
                    : "platform_only",
                updatePolicy:
                  offer.toPlan.updatePolicy,
                upgradedAt: new Date(),
              },
            });

            if (offer.toVersion) {
              await tx.licenseVersionEntitlement.upsert({
                where: {
                  licenseId_version: {
                    licenseId: offer.licenseId,
                    version: offer.toVersion,
                  },
                },
                update: {
                  planId: offer.toPlanId,
                  majorVersion:
                    offer.toPlan
                      .licensedMajorVersion,
                  minimumAppVersion:
                    offer.toPlan
                      .minimumAppVersion,
                  maximumAppVersion:
                    offer.toPlan
                      .maximumAppVersion,
                  status: "active",
                },
                create: {
                  accountId: offer.accountId,
                  licenseId: offer.licenseId,
                  planId: offer.toPlanId,
                  version: offer.toVersion,
                  majorVersion:
                    offer.toPlan
                      .licensedMajorVersion,
                  minimumAppVersion:
                    offer.toPlan
                      .minimumAppVersion,
                  maximumAppVersion:
                    offer.toPlan
                      .maximumAppVersion,
                  status: "active",
                  metadata: {
                    source:
                      "upgrade_offer",
                    offerId: offer.id,
                  },
                },
              });
            }
          }

          return tx.licenseUpgradeOffer.update({
            where: { id: offer.id },
            data: {
              status: "applied",
              appliedAt: new Date(),
              appliedByUserId,
            },
          });
        },
      );

    await this.entitlements.rebuild(
      offer.accountId,
    );

    return updated;
  }

  async cancel(offerId: string) {
    return this.prisma.licenseUpgradeOffer.update({
      where: { id: offerId },
      data: {
        status: "cancelled",
      },
    });
  }

  private numberMap(
    value: unknown,
  ): Record<string, number> {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return {};
    }

    const output: Record<string, number> = {};

    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (
        typeof item === "number" &&
        Number.isFinite(item)
      ) {
        output[key] = Math.max(
          0,
          Math.floor(item),
        );
      }
    }

    return output;
  }
}
