import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../common/auth-user";
import { isDeveloper } from "../common/roles";
import type { CreatePrivateOfferDto, UpdatePrivateOfferDto, AssignPrivateOfferDto } from "./dto/private-offer.dto";

@Injectable()
export class PrivateOffersService {
  constructor(private readonly prisma: PrismaService) {}
  private developerOnly(actor: AuthUser) {
    if (!isDeveloper(actor.role)) throw new ForbiddenException("Only developer can manage private offers.");
  }
  list(actor: AuthUser, includeInactive = false) {
    this.developerOnly(actor);
    return this.prisma.privateOffer.findMany({
      where: includeInactive ? {} : { active: true },
      include: { basePlan: true, assignments: true },
      orderBy: { createdAt: "desc" },
    });
  }
  create(actor: AuthUser, dto: CreatePrivateOfferDto) {
    this.developerOnly(actor);
    return this.prisma.privateOffer.create({
      data: {
        ...dto,
        code: dto.code.trim().toLowerCase(),
        featureOverrides: dto.featureOverrides as Prisma.InputJsonValue | undefined,
        limitOverrides: dto.limitOverrides as Prisma.InputJsonValue | undefined,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        createdByUserId: actor.id,
        schemaVersion: 1,
      },
    });
  }
  async update(actor: AuthUser, id: string, dto: UpdatePrivateOfferDto) {
    this.developerOnly(actor);
    const found = await this.prisma.privateOffer.findUnique({ where: { id } });
    if (!found) throw new NotFoundException("Private offer not found.");
    return this.prisma.privateOffer.update({
      where: { id },
      data: {
        ...dto,
        code: dto.code?.trim().toLowerCase(),
        featureOverrides: dto.featureOverrides as Prisma.InputJsonValue | undefined,
        limitOverrides: dto.limitOverrides as Prisma.InputJsonValue | undefined,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : dto.validFrom === null ? null : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : dto.validUntil === null ? null : undefined,
      },
    });
  }
  async assign(actor: AuthUser, offerId: string, dto: AssignPrivateOfferDto) {
    this.developerOnly(actor);
    const offer = await this.prisma.privateOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException("Private offer not found.");
    return this.prisma.privateOfferAssignment.upsert({
      where: { accountId_offerId: { accountId: dto.accountId, offerId } },
      update: {
        status: "active",
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        revokedAt: null,
        reason: dto.reason || null,
        assignedByUserId: actor.id,
      },
      create: {
        accountId: dto.accountId,
        offerId,
        status: "active",
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        reason: dto.reason || null,
        assignedByUserId: actor.id,
        schemaVersion: 1,
      },
    });
  }
  async revoke(actor: AuthUser, offerId: string, accountId: string) {
    this.developerOnly(actor);
    return this.prisma.privateOfferAssignment.update({
      where: { accountId_offerId: { accountId, offerId } },
      data: { status: "revoked", revokedAt: new Date(), revokedByUserId: actor.id },
    });
  }
}
