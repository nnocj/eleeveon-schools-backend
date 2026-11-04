import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "../common/auth-user";
import { isDeveloper } from "../common/roles";
import { EntitlementsService } from "../entitlements/entitlements.service";
import type {
  UpsertPricingOverrideDto,
} from "./dto/pricing-override.dto";

@Injectable()
export class PricingOverridesService {
  private assertCommercialOperator(actor: AuthUser): void {
    if (!actor || !isDeveloper(actor.role)) {
      throw new ForbiddenException("Platform commercial administrator permission required.");
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async upsert(
    dto: UpsertPricingOverrideDto,
    actor: AuthUser,
  ) {
    this.assertCommercialOperator(actor);
    const result =
      await this.prisma.accountPricingOverride.upsert({
        where: {
          accountId_planId: {
            accountId: dto.accountId,
            planId: dto.planId,
          },
        },
        update: {
          ...dto,
          validFrom: dto.validFrom
            ? new Date(dto.validFrom)
            : undefined,
          validUntil: dto.validUntil
            ? new Date(dto.validUntil)
            : undefined,
          featureOverrides:
            dto.featureOverrides as any,
          limitOverrides:
            dto.limitOverrides as any,
          updatedByUserId: actor.id,
        },
        create: {
          ...dto,
          validFrom: dto.validFrom
            ? new Date(dto.validFrom)
            : undefined,
          validUntil: dto.validUntil
            ? new Date(dto.validUntil)
            : undefined,
          featureOverrides:
            dto.featureOverrides as any,
          limitOverrides:
            dto.limitOverrides as any,
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
          active: dto.active ?? true,
        },
      });

    await this.entitlements.rebuild(
      dto.accountId,
    );

    return result;
  }

  async disable(
    id: string,
    actor: AuthUser,
  ) {
    this.assertCommercialOperator(actor);
    const result =
      await this.prisma.accountPricingOverride.update({
        where: { id },
        data: {
          active: false,
          updatedByUserId: actor.id,
        },
      });

    await this.entitlements.rebuild(
      result.accountId,
    );

    return result;
  }
}
