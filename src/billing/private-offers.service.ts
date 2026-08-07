import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import type {
  AssignPrivateOfferDto,
  CreatePrivateOfferDto,
} from "./dto/private-offer.dto";

@Injectable()
export class PrivateOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  create(
    dto: CreatePrivateOfferDto,
    createdByUserId?: string,
  ) {
    return this.prisma.privateOffer.create({
      data: {
        ...dto,
        validFrom: dto.validFrom
          ? new Date(dto.validFrom)
          : undefined,
        validUntil: dto.validUntil
          ? new Date(dto.validUntil)
          : undefined,
        createdByUserId,
        active: true,
        featureOverrides:
          dto.featureOverrides as any,
        limitOverrides:
          dto.limitOverrides as any,
      },
    });
  }

  async assign(
    dto: AssignPrivateOfferDto,
    assignedByUserId?: string,
  ) {
    const offer =
      await this.prisma.privateOffer.findUnique({
        where: { id: dto.offerId },
      });

    if (!offer || !offer.active) {
      throw new NotFoundException(
        "Private offer not found or inactive.",
      );
    }

    if (
      offer.maxRedemptions !== null &&
      offer.redemptionCount >=
        offer.maxRedemptions
    ) {
      throw new ConflictException(
        "The private offer has reached its redemption limit.",
      );
    }

    const assignment =
      await this.prisma.$transaction(
        async (tx) => {
          const created =
            await tx.privateOfferAssignment.upsert({
              where: {
                accountId_offerId: {
                  accountId: dto.accountId,
                  offerId: dto.offerId,
                },
              },
              update: {
                status: "active",
                validFrom: dto.validFrom
                  ? new Date(dto.validFrom)
                  : undefined,
                validUntil: dto.validUntil
                  ? new Date(dto.validUntil)
                  : undefined,
                reason: dto.reason,
                assignedByUserId,
                revokedAt: null,
              },
              create: {
                accountId: dto.accountId,
                offerId: dto.offerId,
                status: "active",
                validFrom: dto.validFrom
                  ? new Date(dto.validFrom)
                  : undefined,
                validUntil: dto.validUntil
                  ? new Date(dto.validUntil)
                  : undefined,
                reason: dto.reason,
                assignedByUserId,
              },
            });

          await tx.privateOffer.update({
            where: { id: dto.offerId },
            data: {
              redemptionCount: {
                increment: 1,
              },
            },
          });

          return created;
        },
      );

    await this.entitlements.rebuild(
      dto.accountId,
    );

    return assignment;
  }

  async revoke(
    assignmentId: string,
    revokedByUserId?: string,
  ) {
    const assignment =
      await this.prisma.privateOfferAssignment.update({
        where: { id: assignmentId },
        data: {
          status: "revoked",
          revokedAt: new Date(),
          revokedByUserId,
        },
      });

    await this.entitlements.rebuild(
      assignment.accountId,
    );

    return assignment;
  }
}
