import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import { LicenseCryptoService } from "./license-crypto.service";
import { LicensePolicyService } from "./license-policy.service";
import type { ActivateLicenseDto } from "./dto/activate-license.dto";
import type {
  SignedLicenseStatePayload,
} from "./types/license.types";

@Injectable()
export class LicenseActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: LicenseCryptoService,
    private readonly policy: LicensePolicyService,
  ) {}

  async activate(dto: ActivateLicenseDto) {
    const license =
      await this.findByRawKey(dto.licenseKey);

    if (license.status !== "active") {
      throw new BadRequestException(
        `Licence is ${license.status}.`,
      );
    }

    const existing =
      await this.prisma.licenseActivation.findUnique({
        where: {
          licenseId_deviceId: {
            licenseId: license.id,
            deviceId: dto.deviceId,
          },
        },
      });

    const activeActivationCount =
      await this.prisma.licenseActivation.count({
        where: {
          licenseId: license.id,
          status: "active",
        },
      });

    const activeDeviceCount =
      await this.prisma.licenseDevice.count({
        where: {
          licenseId: license.id,
          status: "active",
        },
      });

    if (
      !existing &&
      license.activationLimit !== null &&
      activeActivationCount >=
        license.activationLimit
    ) {
      throw new ConflictException(
        `Licence activation limit of ${license.activationLimit} has been reached.`,
      );
    }

    if (
      !existing &&
      license.deviceLimit !== null &&
      activeDeviceCount >= license.deviceLimit
    ) {
      throw new ConflictException(
        `Licence device limit of ${license.deviceLimit} has been reached.`,
      );
    }

    const activationToken =
      this.crypto.token();
    const fingerprintHash =
      this.crypto.fingerprintHash(
        dto.machineFingerprint,
      );

    const now = new Date();

    const { activation, device } =
      await this.prisma.$transaction(
        async (tx) => {
          const activation =
            await tx.licenseActivation.upsert({
              where: {
                licenseId_deviceId: {
                  licenseId: license.id,
                  deviceId: dto.deviceId,
                },
              },
              update: {
                deviceName: dto.deviceName,
                platform: dto.platform,
                appVersion: dto.appVersion,
                machineFingerprintHash:
                  fingerprintHash,
                status: "active",
                lastCheckedAt: now,
                deactivatedAt: null,
                revokedAt: null,
                activationTokenHash:
                  this.crypto.hash(
                    activationToken,
                  ),
              },
              create: {
                accountId: license.accountId,
                licenseId: license.id,
                deviceId: dto.deviceId,
                deviceName: dto.deviceName,
                platform: dto.platform,
                appVersion: dto.appVersion,
                machineFingerprintHash:
                  fingerprintHash,
                status: "active",
                activatedAt: now,
                lastCheckedAt: now,
                activationTokenHash:
                  this.crypto.hash(
                    activationToken,
                  ),
              },
            });

          const device =
            await tx.licenseDevice.upsert({
              where: {
                licenseId_deviceId: {
                  licenseId: license.id,
                  deviceId: dto.deviceId,
                },
              },
              update: {
                deviceName: dto.deviceName,
                platform: dto.platform,
                appVersion: dto.appVersion,
                machineFingerprintHash:
                  fingerprintHash,
                status: "active",
                lastSeenAt: now,
                revokedAt: null,
              },
              create: {
                accountId: license.accountId,
                licenseId: license.id,
                deviceId: dto.deviceId,
                deviceName: dto.deviceName,
                platform: dto.platform,
                appVersion: dto.appVersion,
                machineFingerprintHash:
                  fingerprintHash,
                status: "active",
                firstSeenAt: now,
                lastSeenAt: now,
              },
            });

          return { activation, device };
        },
      );

    const state =
      this.signedState(license, activation.id, dto.deviceId);

    return {
      licenseId: license.id,
      accountId: license.accountId,
      activationId: activation.id,
      deviceId: device.deviceId,
      activationToken,
      signedLicenseState:
        this.crypto.signState(state),
      nextValidationAt:
        license.nextValidationAt,
      graceEndsAt:
        this.policy.graceEndsAt(license),
    };
  }

  async deactivate(
    licenseId: string,
    deviceId: string,
  ) {
    const activation =
      await this.prisma.licenseActivation.findUnique({
        where: {
          licenseId_deviceId: {
            licenseId,
            deviceId,
          },
        },
      });

    if (!activation) {
      throw new NotFoundException(
        "Licence activation not found.",
      );
    }

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.licenseActivation.update({
        where: { id: activation.id },
        data: {
          status: "deactivated",
          deactivatedAt: now,
        },
      }),
      this.prisma.licenseDevice.update({
        where: {
          licenseId_deviceId: {
            licenseId,
            deviceId,
          },
        },
        data: {
          status: "deactivated",
        },
      }),
    ]);

    return {
      deactivated: true,
      licenseId,
      deviceId,
    };
  }

  async findByRawKey(licenseKey: string) {
    const license =
      await this.prisma.perpetualLicense.findUnique({
        where: {
          licenseKeyHash:
            this.crypto.hash(licenseKey),
        },
        include: {
          plan: true,
          versionEntitlements: {
            where: {
              status: "active",
            },
            orderBy: {
              grantedAt: "desc",
            },
          },
        },
      });

    if (!license) {
      throw new NotFoundException(
        "Perpetual licence not found.",
      );
    }

    return license;
  }

  private signedState(
    license: Awaited<
      ReturnType<
        LicenseActivationService["findByRawKey"]
      >
    >,
    activationId: string,
    deviceId: string,
  ): SignedLicenseStatePayload {
    return {
      schemaVersion: 1,
      licenseId: license.id,
      accountId: license.accountId,
      activationId,
      deviceId,
      entitledVersion:
        license.entitledVersion,
      licensedMajorVersion:
        license.licensedMajorVersion,
      status: license.status,
      syncPolicy: license.syncPolicy,
      updatePolicy: license.updatePolicy,
      issuedAt: Date.now(),
      nextValidationAt:
        license.nextValidationAt?.getTime() ??
        null,
      graceEndsAt:
        this.policy
          .graceEndsAt(license)
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
  }
}
