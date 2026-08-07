import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthRequest } from "../common/auth-user";

import { ActivateLicenseDto } from "./dto/activate-license.dto";
import { CreatePerpetualLicenseDto } from "./dto/create-perpetual-license.dto";
import { CreateLicenseUpgradeOfferDto } from "./dto/create-upgrade-offer.dto";
import { ValidateLicenseDto } from "./dto/validate-license.dto";

import { LicenseActivationService } from "./license-activation.service";
import { LicenseUpgradeService } from "./license-upgrade.service";
import { LicenseValidationService } from "./license-validation.service";
import { PerpetualLicenseService } from "./perpetual-license.service";

@Controller("licenses")
export class LicensesController {
  constructor(
    private readonly licenses: PerpetualLicenseService,
    private readonly activations: LicenseActivationService,
    private readonly validation: LicenseValidationService,
    private readonly upgrades: LicenseUpgradeService,
  ) {}

  /**
   * Public activation endpoint. The raw licence key is the credential.
   */
  @Post("activate")
  activate(@Body() dto: ActivateLicenseDto) {
    return this.activations.activate(dto);
  }

  /**
   * Public validation endpoint used by offline installations whenever
   * connectivity is available.
   */
  @Post("validate")
  validate(@Body() dto: ValidateLicenseDto) {
    return this.validation.validate(dto);
  }

  @Post("deactivate")
  deactivate(
    @Body()
    dto: {
      licenseId: string;
      deviceId: string;
    },
  ) {
    return this.activations.deactivate(
      dto.licenseId,
      dto.deviceId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  issue(
    @Body() dto: CreatePerpetualLicenseDto,
    @Req() request: AuthRequest,
  ) {
    return this.licenses.issue(
      dto,
      request.user.id,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @Req() request: AuthRequest,
    @Query("accountId") accountId?: string,
  ) {
    return this.licenses.getForAccount(
      accountId ??
        request.user.accountId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/suspend")
  suspend(
    @Param("id") id: string,
    @Body() dto: { reason?: string },
  ) {
    return this.licenses.suspend(
      id,
      dto.reason,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/revoke")
  revoke(
    @Param("id") id: string,
    @Body() dto: { reason?: string },
  ) {
    return this.licenses.revoke(
      id,
      dto.reason,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post("upgrade-offers")
  createUpgradeOffer(
    @Body()
    dto: CreateLicenseUpgradeOfferDto,
    @Req() request: AuthRequest,
  ) {
    return this.upgrades.createOffer(
      dto,
      request.user.id,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post("upgrade-offers/:id/paid")
  markUpgradePaid(
    @Param("id") id: string,
    @Body() dto: { paymentId?: string },
  ) {
    return this.upgrades.markPaid(
      id,
      dto.paymentId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post("upgrade-offers/:id/apply")
  applyUpgrade(
    @Param("id") id: string,
    @Req() request: AuthRequest,
  ) {
    return this.upgrades.apply(
      id,
      request.user.id,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post("upgrade-offers/:id/cancel")
  cancelUpgrade(@Param("id") id: string) {
    return this.upgrades.cancel(id);
  }
}
