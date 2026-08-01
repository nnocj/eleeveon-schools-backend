import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type { AuthUser } from "../common/auth-user";
import { isDeveloper } from "../common/roles";
import { PrismaService } from "../prisma/prisma.service";

import type {
  CreatePricingOverrideDto,
  UpdatePricingOverrideDto,
} from "./dto/pricing-override.dto";

@Injectable()
export class PricingOverridesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private developerOnly(actor: AuthUser) {
    if (!isDeveloper(actor.role)) {
      throw new ForbiddenException(
        "Only developer can manage pricing overrides.",
      );
    }
  }

  list(actor: AuthUser, accountId?: string) {
    this.developerOnly(actor);

    return this.prisma.accountPricingOverride.findMany({
      where: accountId ? { accountId } : {},
      include: {
        account: true,
        plan: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
  }

  create(
    actor: AuthUser,
    dto: CreatePricingOverrideDto,
  ) {
    this.developerOnly(actor);

    const sharedData = this.buildSharedData(
      actor,
      dto,
    );

    const updateData: Prisma.AccountPricingOverrideUncheckedUpdateInput = {
      ...sharedData,
    };

    const createData: Prisma.AccountPricingOverrideUncheckedCreateInput = {
      accountId: dto.accountId,
      planId: dto.planId,
      ...sharedData,
      createdByUserId: actor.id,
      schemaVersion: 1,
    };

    return this.prisma.accountPricingOverride.upsert({
      where: {
        accountId_planId: {
          accountId: dto.accountId,
          planId: dto.planId,
        },
      },
      update: updateData,
      create: createData,
    });
  }

  async update(
    actor: AuthUser,
    id: string,
    dto: UpdatePricingOverrideDto,
  ) {
    this.developerOnly(actor);

    const found =
      await this.prisma.accountPricingOverride.findUnique({
        where: { id },
      });

    if (!found) {
      throw new NotFoundException(
        "Pricing override not found.",
      );
    }

    const data: Prisma.AccountPricingOverrideUncheckedUpdateInput = {
      ...this.buildSharedData(actor, dto),
    };

    return this.prisma.accountPricingOverride.update({
      where: { id },
      data,
    });
  }

  async remove(
    actor: AuthUser,
    id: string,
  ) {
    this.developerOnly(actor);

    const found =
      await this.prisma.accountPricingOverride.findUnique({
        where: { id },
        select: { id: true },
      });

    if (!found) {
      throw new NotFoundException(
        "Pricing override not found.",
      );
    }

    return this.prisma.accountPricingOverride.update({
      where: { id },
      data: {
        active: false,
        updatedByUserId: actor.id,
      },
    });
  }

  /**
   * Returns only scalar fields shared by both Prisma create and update inputs.
   *
   * Keeping accountId and planId out of this helper prevents Prisma update
   * operation types such as StringFieldUpdateOperationsInput from leaking
   * into the create payload.
   */
  private buildSharedData(
    actor: AuthUser,
    dto:
      | CreatePricingOverrideDto
      | UpdatePricingOverrideDto,
  ) {
    return {
      ...(dto.currency !== undefined
        ? {
            currency: dto.currency
              .trim()
              .toUpperCase(),
          }
        : {}),

      ...(dto.priceMonthly !== undefined
        ? {
            priceMonthly: dto.priceMonthly,
          }
        : {}),

      ...(dto.priceTermly !== undefined
        ? {
            priceTermly: dto.priceTermly,
          }
        : {}),

      ...(dto.priceYearly !== undefined
        ? {
            priceYearly: dto.priceYearly,
          }
        : {}),

      ...(dto.discountType !== undefined
        ? {
            discountType: dto.discountType,
          }
        : {}),

      ...(dto.discountValue !== undefined
        ? {
            discountValue: dto.discountValue,
          }
        : {}),

      ...(dto.featureOverrides !== undefined
        ? {
            featureOverrides:
              dto.featureOverrides === null
                ? Prisma.JsonNull
                : (dto.featureOverrides as Prisma.InputJsonValue),
          }
        : {}),

      ...(dto.limitOverrides !== undefined
        ? {
            limitOverrides:
              dto.limitOverrides === null
                ? Prisma.JsonNull
                : (dto.limitOverrides as Prisma.InputJsonValue),
          }
        : {}),

      ...(dto.validFrom !== undefined
        ? {
            validFrom: dto.validFrom
              ? new Date(dto.validFrom)
              : null,
          }
        : {}),

      ...(dto.validUntil !== undefined
        ? {
            validUntil: dto.validUntil
              ? new Date(dto.validUntil)
              : null,
          }
        : {}),

      ...(dto.reason !== undefined
        ? {
            reason: dto.reason,
          }
        : {}),

      ...(dto.active !== undefined
        ? {
            active: dto.active,
          }
        : {}),

      updatedByUserId: actor.id,
    } satisfies Omit<
      Prisma.AccountPricingOverrideUncheckedCreateInput,
      | "id"
      | "accountId"
      | "planId"
      | "createdByUserId"
      | "schemaVersion"
      | "createdAt"
      | "updatedAt"
    >;
  }
}