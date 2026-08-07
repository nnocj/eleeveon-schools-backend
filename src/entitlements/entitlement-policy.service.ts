import { Injectable } from "@nestjs/common";
import {
  DEFAULT_FEATURES,
  RESOURCE_TO_USAGE_FIELD,
} from "./types/entitlement.constants";
import type {
  EffectiveAccess,
  EffectiveAccessSnapshot,
  EntitlementFeatureKey,
  EntitlementResourceKey,
  EntitlementUsage,
} from "./types/entitlement.types";

@Injectable()
export class EntitlementPolicyService {
  normalizeFeatures(
    input: unknown,
  ): Record<string, boolean> {
    const result: Record<string, boolean> = {
      ...DEFAULT_FEATURES,
    };

    if (!input || typeof input !== "object") {
      return result;
    }

    for (const [key, value] of Object.entries(
      input as Record<string, unknown>,
    )) {
      if (typeof value === "boolean") {
        result[key] = value;
      }
    }

    return result;
  }

  normalizeLimits(
    input: Record<string, unknown>,
  ): Record<string, number | null> {
    const result: Record<string, number | null> = {};

    for (const [key, value] of Object.entries(input)) {
      if (value === null) {
        result[key] = null;
      } else if (
        typeof value === "number" &&
        Number.isFinite(value)
      ) {
        result[key] = Math.max(0, Math.floor(value));
      }
    }

    return result;
  }

  createAccess(
    snapshot: EffectiveAccessSnapshot,
    usage?: EntitlementUsage,
  ): EffectiveAccess {
    const can = (
      feature: EntitlementFeatureKey,
    ): boolean => {
      if (
        snapshot.status === "expired" ||
        snapshot.status === "suspended" ||
        snapshot.status === "cancelled"
      ) {
        return false;
      }

      return snapshot.features[feature] === true;
    };

    const limit = (
      resource: EntitlementResourceKey,
    ): number | null => {
      const value = snapshot.limits[resource];
      return typeof value === "number" ? value : null;
    };

    const used = (
      resource: EntitlementResourceKey,
    ): number => {
      if (!usage) return 0;

      const field =
        RESOURCE_TO_USAGE_FIELD[resource];

      if (!field) return 0;

      const value = usage[field];
      return typeof value === "number" ? value : 0;
    };

    const remaining = (
      resource: EntitlementResourceKey,
    ): number | null => {
      const max = limit(resource);
      if (max === null) return null;
      return Math.max(0, max - used(resource));
    };

    return {
      snapshot,
      usage,
      can,
      limit,
      used,
      remaining,
      hasCapacity(
        resource: EntitlementResourceKey,
        increase = 1,
      ) {
        const max = limit(resource);
        if (max === null) return true;
        return used(resource) + increase <= max;
      },
      get syncPolicy() {
        return snapshot.syncPolicy;
      },
      get updatePolicy() {
        return snapshot.updatePolicy;
      },
      get deploymentMode() {
        return snapshot.deploymentMode;
      },
      get licenseModel() {
        return snapshot.licenseModel;
      },
      get status() {
        return snapshot.status;
      },
    };
  }
}
