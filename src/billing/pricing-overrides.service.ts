import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import type {
  UpsertPricingOverrideDto,
} from "./dto/pricing-override.dto";

@Injectable()
export class PricingOverridesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async upsert(
    dto: UpsertPricingOverrideDto,
    userId?: string,
  ) {
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
          updatedByUserId: userId,
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
          createdByUserId: userId,
          updatedByUserId: userId,
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
    userId?: string,
  ) {
    const result =
      await this.prisma.accountPricingOverride.update({
        where: { id },
        data: {
          active: false,
          updatedByUserId: userId,
        },
      });

    await this.entitlements.rebuild(
      result.accountId,
    );

    return result;
  }
}
