export type PerpetualLicenseStatus =
  | "pending"
  | "active"
  | "suspended"
  | "revoked"
  | "upgraded";

export type LicenseActivationStatus =
  | "active"
  | "deactivated"
  | "revoked"
  | "replaced";

export type LicenseValidationResult =
  | "valid"
  | "grace"
  | "version_blocked"
  | "device_blocked"
  | "activation_blocked"
  | "validation_required"
  | "suspended"
  | "revoked"
  | "expired"
  | "failed";

export type LicenseUpgradeType =
  | "version"
  | "capacity"
  | "device_limit"
  | "connected_migration";

export interface DeviceIdentity {
  deviceId: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
  machineFingerprint?: string;
}

export interface LicenseValidationResponse {
  valid: boolean;
  result: LicenseValidationResult;
  message: string;

  licenseId: string;
  accountId: string;
  activationId?: string;

  entitledVersion: string;
  licensedMajorVersion?: number | null;

  syncPolicy: string;
  updatePolicy: string;

  requiresOnlineValidation: boolean;
  nextValidationAt?: Date | null;
  graceEndsAt?: Date | null;

  limits: {
    schools?: number | null;
    branches?: number | null;
    users?: number | null;
    students?: number | null;
    teachers?: number | null;
    devices?: number | null;
    activations?: number | null;
  };

  signedLicenseState?: string;
}

export interface SignedLicenseStatePayload {
  schemaVersion: 1;
  licenseId: string;
  accountId: string;
  activationId: string;
  deviceId: string;

  entitledVersion: string;
  licensedMajorVersion?: number | null;

  status: string;
  syncPolicy: string;
  updatePolicy: string;

  issuedAt: number;
  nextValidationAt?: number | null;
  graceEndsAt?: number | null;

  limits: Record<string, number | null | undefined>;
}
