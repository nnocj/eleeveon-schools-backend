import { Module } from "@nestjs/common";

import { EntitlementsModule } from "../entitlements/entitlements.module";

import { LicenseActivationService } from "./license-activation.service";
import { LicenseCryptoService } from "./license-crypto.service";
import { LicensePolicyService } from "./license-policy.service";
import { LicenseUpgradeService } from "./license-upgrade.service";
import { LicenseValidationService } from "./license-validation.service";
import { LicensesController } from "./licenses.controller";
import { PerpetualLicenseService } from "./perpetual-license.service";

@Module({
  imports: [EntitlementsModule],
  controllers: [LicensesController],
  providers: [
    LicenseCryptoService,
    LicensePolicyService,
    PerpetualLicenseService,
    LicenseActivationService,
    LicenseValidationService,
    LicenseUpgradeService,
  ],
  exports: [
    LicenseCryptoService,
    LicensePolicyService,
    PerpetualLicenseService,
    LicenseActivationService,
    LicenseValidationService,
    LicenseUpgradeService,
  ],
})
export class LicensesModule {}
