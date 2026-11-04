import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "../common/auth-user";
import { isDeveloper } from "../common/roles";
import { EntitlementsService } from "../entitlements/entitlements.service";
import type {
  AssignPrivateOfferDto,
  CreatePrivateOfferDto,
} from "./dto/private-offer.dto";

@Injectable()
export class PrivateOffersService {
  private assertCommercialOperator(actor: AuthUser): void {
    if (!actor || !isDeveloper(actor.role)) {
      throw new ForbiddenException("Platform commercial administrator permission required.");
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  create(
    dto: CreatePrivateOfferDto,
    actor: AuthUser,
  ) {
    this.assertCommercialOperator(actor);
    return this.prisma.privateOffer.create({
      data: {
        ...dto,
        validFrom: dto.validFrom
          ? new Date(dto.validFrom)
          : undefined,
        validUntil: dto.validUntil
          ? new Date(dto.validUntil)
          : undefined,
        createdByUserId: actor.id,
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
    actor: AuthUser,
  ) {
    this.assertCommercialOperator(actor);
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
                assignedByUserId: actor.id,
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
                assignedByUserId: actor.id,
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
    actor: AuthUser,
  ) {
    this.assertCommercialOperator(actor);
    const assignment =
      await this.prisma.privateOfferAssignment.update({
        where: { id: assignmentId },
        data: {
          status: "revoked",
          revokedAt: new Date(),
          revokedByUserId: actor.id,
        },
      });

    await this.entitlements.rebuild(
      assignment.accountId,
    );

    return assignment;
  }
}
