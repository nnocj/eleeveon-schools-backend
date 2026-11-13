import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { AuthUser } from "../common/auth-user";
import { requireCommercialOperator } from "./commercial-operator";
import { ForbiddenException } from "@nestjs/common";
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

  /**
   * Atomic per-licence activation. The PostgreSQL advisory lock prevents two
   * simultaneous devices from both passing the last available slot.
   * The raw licence key is never persisted or placed in audit details.
   */
  async activate(dto: ActivateLicenseDto) {
    const keyRecord = await this.findByRawKey(dto.licenseKey);
    const licenseId = keyRecord.id;
    const fingerprintHash = this.crypto.fingerprintHash(dto.machineFingerprint);
    const activationToken = this.crypto.token();
    const now = new Date();

    const { license, activation, device } = await this.prisma.$transaction(
      async (tx) => {
        // Lock by licence, shared with deactivation below.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`eleeveon-license:${licenseId}`}))`;

        // Re-read under lock: suspension/revocation and active slots must be current.
        const license = await tx.perpetualLicense.findUnique({
          where: { id: licenseId },
          include: {
            plan: true,
            versionEntitlements: {
              where: { status: "active" },
              orderBy: { grantedAt: "desc" },
            },
          },
        });
        if (!license) throw new NotFoundException("Perpetual licence not found.");
        if (license.status !== "active") {
          throw new BadRequestException(`Licence is ${license.status}.`);
        }

        const [existingActivation, existingDevice, activeActivationCount, activeDeviceCount] = await Promise.all([
          tx.licenseActivation.findUnique({
            where: { licenseId_deviceId: { licenseId, deviceId: dto.deviceId } },
          }),
          tx.licenseDevice.findUnique({
            where: { licenseId_deviceId: { licenseId, deviceId: dto.deviceId } },
          }),
          tx.licenseActivation.count({ where: { licenseId, status: "active" } }),
          tx.licenseDevice.count({ where: { licenseId, status: "active" } }),
        ]);

        // A revoked device cannot self-unrevoke just by retaining the licence key.
        if (existingActivation?.status === "revoked" || existingDevice?.status === "revoked") {
          throw new ForbiddenException("This device was revoked; contact the licence administrator.");
        }
        // A device ID is not permission to silently change physical installation.
        if ((existingActivation?.machineFingerprintHash &&
             existingActivation.machineFingerprintHash !== fingerprintHash) ||
            (existingDevice?.machineFingerprintHash &&
             existingDevice.machineFingerprintHash !== fingerprintHash)) {
          throw new ConflictException("Device fingerprint differs from the registered installation.");
        }

        if (existingActivation?.status !== "active" &&
            license.activationLimit != null &&
            activeActivationCount >= license.activationLimit) {
          throw new ConflictException(
            `Licence activation limit of ${license.activationLimit} has been reached.`,
          );
        }
        if (existingDevice?.status !== "active" &&
            license.deviceLimit != null &&
            activeDeviceCount >= license.deviceLimit) {
          throw new ConflictException(
            `Licence device limit of ${license.deviceLimit} has been reached.`,
          );
        }

        const activation = await tx.licenseActivation.upsert({
          where: { licenseId_deviceId: { licenseId, deviceId: dto.deviceId } },
          update: {
            deviceName: dto.deviceName,
            platform: dto.platform,
            appVersion: dto.appVersion,
            machineFingerprintHash: fingerprintHash,
            status: "active",
            lastCheckedAt: now,
            deactivatedAt: null,
            revokedAt: null,
            activationTokenHash: this.crypto.hash(activationToken),
          },
          create: {
            accountId: license.accountId,
            licenseId,
            deviceId: dto.deviceId,
            deviceName: dto.deviceName,
            platform: dto.platform,
            appVersion: dto.appVersion,
            machineFingerprintHash: fingerprintHash,
            status: "active",
            activatedAt: now,
            lastCheckedAt: now,
            activationTokenHash: this.crypto.hash(activationToken),
          },
        });

        const device = await tx.licenseDevice.upsert({
          where: { licenseId_deviceId: { licenseId, deviceId: dto.deviceId } },
          update: {
            deviceName: dto.deviceName,
            platform: dto.platform,
            appVersion: dto.appVersion,
            machineFingerprintHash: fingerprintHash,
            status: "active",
            lastSeenAt: now,
            revokedAt: null,
          },
          create: {
            accountId: license.accountId,
            licenseId,
            deviceId: dto.deviceId,
            deviceName: dto.deviceName,
            platform: dto.platform,
            appVersion: dto.appVersion,
            machineFingerprintHash: fingerprintHash,
            status: "active",
            firstSeenAt: now,
            lastSeenAt: now,
          },
        });

        await tx.licenseValidationEvent.create({
          data: {
            accountId: license.accountId,
            licenseId,
            activationId: activation.id,
            deviceId: dto.deviceId,
            appVersion: dto.appVersion,
            result: "activated",
            message: existingActivation ? "Licence device reactivated / token rotated." : "Licence activated.",
          },
        });
        return { license, activation, device };
      },
      { timeout: 15000 },
    );

    const state = this.signedState(license, activation.id, dto.deviceId);
    return {
      licenseId: license.id,
      accountId: license.accountId,
      activationId: activation.id,
      deviceId: device.deviceId,
      activationToken,
      signedLicenseState: this.crypto.signState(state),
      nextValidationAt: license.nextValidationAt,
      graceEndsAt: this.policy.graceEndsAt(license),
    };
  }

  async deactivate(licenseId: string, deviceId: string, actor: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`eleeveon-license:${licenseId}`}))`;
      const activation = await tx.licenseActivation.findUnique({
        where: { licenseId_deviceId: { licenseId, deviceId } },
      });
      if (!activation) throw new NotFoundException("Licence activation not found.");
      if (activation.accountId !== actor.accountId) requireCommercialOperator(actor);

      const device = await tx.licenseDevice.findUnique({
        where: { licenseId_deviceId: { licenseId, deviceId } },
      });
      const now = new Date();
      if (activation.status !== "deactivated") {
        await tx.licenseActivation.update({
          where: { id: activation.id },
          data: { status: "deactivated", deactivatedAt: now },
        });
      }
      if (device && device.status !== "deactivated") {
        await tx.licenseDevice.update({
          where: { id: device.id },
          data: { status: "deactivated" },
        });
      }
      await tx.licenseValidationEvent.create({
        data: {
          accountId: activation.accountId,
          licenseId,
          activationId: activation.id,
          deviceId,
          result: "deactivated",
          message: "Licence device deactivated by authenticated account user.",
        },
      });
      return { deactivated: true, licenseId, deviceId };
    }, { timeout: 15000 });
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
