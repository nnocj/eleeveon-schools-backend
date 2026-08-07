import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import { LicenseActivationService } from "./license-activation.service";
import { LicenseCryptoService } from "./license-crypto.service";
import { LicensePolicyService } from "./license-policy.service";
import type { ValidateLicenseDto } from "./dto/validate-license.dto";
import type {
  LicenseValidationResponse,
  LicenseValidationResult,
  SignedLicenseStatePayload,
} from "./types/license.types";

@Injectable()
export class LicenseValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activations: LicenseActivationService,
    private readonly crypto: LicenseCryptoService,
    private readonly policy: LicensePolicyService,
  ) {}

  async validate(
    dto: ValidateLicenseDto,
  ): Promise<LicenseValidationResponse> {
    const now = new Date();
    const license =
      await this.activations.findByRawKey(
        dto.licenseKey,
      );

    const activation =
      await this.prisma.licenseActivation.findUnique({
        where: {
          licenseId_deviceId: {
            licenseId: license.id,
            deviceId: dto.deviceId,
          },
        },
      });

    const device =
      await this.prisma.licenseDevice.findUnique({
        where: {
          licenseId_deviceId: {
            licenseId: license.id,
            deviceId: dto.deviceId,
          },
        },
      });

    let result: LicenseValidationResult =
      "valid";
    let valid = true;
    let message = "Licence is valid.";

    if (license.status === "suspended") {
      result = "suspended";
      valid = false;
      message = "Licence is suspended.";
    } else if (license.status === "revoked") {
      result = "revoked";
      valid = false;
      message = "Licence is revoked.";
    } else if (!activation) {
      result = "activation_blocked";
      valid = false;
      message =
        "This device has not activated the licence.";
    } else if (activation.status !== "active") {
      result = "activation_blocked";
      valid = false;
      message = `Activation is ${activation.status}.`;
    } else if (!device || device.status !== "active") {
      result = "device_blocked";
      valid = false;
      message =
        "This device is not active for the licence.";
    } else if (
      activation.machineFingerprintHash &&
      this.crypto.fingerprintHash(
        dto.machineFingerprint,
      ) !==
        activation.machineFingerprintHash
    ) {
      result = "device_blocked";
      valid = false;
      message =
        "Device fingerprint does not match the activated device.";
    } else if (
      !this.policy.versionAllowed({
        appVersion: dto.appVersion,
        entitledVersion:
          license.entitledVersion,
        licensedMajorVersion:
          license.licensedMajorVersion,
        minimumAppVersion:
          license.versionEntitlements[0]
            ?.minimumAppVersion ??
          license.plan.minimumAppVersion,
        maximumAppVersion:
          license.versionEntitlements[0]
            ?.maximumAppVersion ??
          license.plan.maximumAppVersion,
        updatePolicy: license.updatePolicy,
      })
    ) {
      result = "version_blocked";
      valid = false;
      message =
        "This application version is not covered by the perpetual licence.";
    } else if (
      license.requiresPeriodicValidation &&
      license.nextValidationAt &&
      now > license.nextValidationAt
    ) {
      const graceEndsAt =
        this.policy.graceEndsAt(license);

      if (graceEndsAt && now <= graceEndsAt) {
        result = "grace";
        valid = true;
        message =
          "Online validation is overdue, but the licence remains inside its offline grace period.";
      } else {
        result = "validation_required";
        valid = false;
        message =
          "Online licence validation is required.";
      }
    }

    const nextValidationAt =
      valid &&
      result !== "grace" &&
      license.requiresPeriodicValidation
        ? this.policy.nextValidationAt(
            now,
            license.validationIntervalDays,
          )
        : license.nextValidationAt;

    if (valid && result === "valid") {
      await this.prisma.$transaction([
        this.prisma.perpetualLicense.update({
          where: { id: license.id },
          data: {
            lastValidatedAt: now,
            nextValidationAt,
          },
        }),
        this.prisma.licenseActivation.update({
          where: { id: activation!.id },
          data: {
            lastCheckedAt: now,
            appVersion:
              dto.appVersion ??
              activation!.appVersion,
          },
        }),
        this.prisma.licenseDevice.update({
          where: { id: device!.id },
          data: {
            lastSeenAt: now,
            appVersion:
              dto.appVersion ??
              device!.appVersion,
          },
        }),
      ]);
    }

    await this.prisma.licenseValidationEvent.create({
      data: {
        accountId: license.accountId,
        licenseId: license.id,
        activationId: activation?.id,
        deviceId: dto.deviceId,
        appVersion: dto.appVersion,
        result,
        message,
        details: {
          validationAt: now.toISOString(),
          nextValidationAt:
            nextValidationAt?.toISOString(),
        },
      },
    });

    const state: SignedLicenseStatePayload = {
      schemaVersion: 1,
      licenseId: license.id,
      accountId: license.accountId,
      activationId:
        activation?.id ?? "",
      deviceId: dto.deviceId,
      entitledVersion:
        license.entitledVersion,
      licensedMajorVersion:
        license.licensedMajorVersion,
      status: license.status,
      syncPolicy: license.syncPolicy,
      updatePolicy: license.updatePolicy,
      issuedAt: now.getTime(),
      nextValidationAt:
        nextValidationAt?.getTime() ?? null,
      graceEndsAt:
        this.policy
          .graceEndsAt({
            ...license,
            nextValidationAt,
          })
          ?.getTime() ?? null,
      limits: {
        schools: license.maxSchools,
        branches: license.maxBranches,
        users: license.maxUsers,
        students: license.maxStudents,
        teachers: license.maxTeachers,
        devices: license.deviceLimit,
        activations:
          license.activationLimit,
      },
    };

    return {
      valid,
      result,
      message,
      licenseId: license.id,
      accountId: license.accountId,
      activationId: activation?.id,
      entitledVersion:
        license.entitledVersion,
      licensedMajorVersion:
        license.licensedMajorVersion,
      syncPolicy: license.syncPolicy,
      updatePolicy: license.updatePolicy,
      requiresOnlineValidation:
        license.requiresPeriodicValidation,
      nextValidationAt,
      graceEndsAt:
        this.policy.graceEndsAt({
          ...license,
          nextValidationAt,
        }),
      limits: state.limits,
      signedLicenseState:
        valid
          ? this.crypto.signState(state)
          : undefined,
    };
  }
}
