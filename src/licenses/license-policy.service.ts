import { Injectable } from "@nestjs/common";
import {
  compareVersions,
  majorVersion,
  versionWithinRange,
} from "./utils/version.util";

@Injectable()
export class LicensePolicyService {
  graceEndsAt(license: {
    nextValidationAt: Date | null;
    offlineGraceDays: number | null;
  }): Date | null {
    if (!license.nextValidationAt) return null;

    return new Date(
      license.nextValidationAt.getTime() +
        Math.max(
          0,
          license.offlineGraceDays ?? 0,
        ) *
          86_400_000,
    );
  }

  nextValidationAt(
    from: Date,
    intervalDays?: number | null,
  ): Date | null {
    if (!intervalDays || intervalDays <= 0) {
      return null;
    }

    return new Date(
      from.getTime() +
        intervalDays * 86_400_000,
    );
  }

  versionAllowed(input: {
    appVersion?: string;
    entitledVersion: string;
    licensedMajorVersion?: number | null;
    minimumAppVersion?: string | null;
    maximumAppVersion?: string | null;
    updatePolicy: string;
  }): boolean {
    if (!input.appVersion) return true;

    if (
      !versionWithinRange(
        input.appVersion,
        input.minimumAppVersion,
        input.maximumAppVersion,
      )
    ) {
      return false;
    }

    if (
      input.updatePolicy !== "version_locked"
    ) {
      return true;
    }

    if (
      input.licensedMajorVersion !== null &&
      input.licensedMajorVersion !== undefined
    ) {
      return (
        majorVersion(input.appVersion) ===
        input.licensedMajorVersion
      );
    }

    return (
      compareVersions(
        input.appVersion,
        input.entitledVersion,
      ) <= 0
    );
  }
}
