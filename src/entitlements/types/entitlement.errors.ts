import { ForbiddenException } from "@nestjs/common";

export class FeatureUnavailableException extends ForbiddenException {
  constructor(
    public readonly feature: string,
    message = `The ${feature} feature is not available for this account.`,
  ) {
    super({
      code: "FEATURE_UNAVAILABLE",
      feature,
      message,
    });
  }
}

export class ResourceLimitExceededException extends ForbiddenException {
  constructor(
    public readonly resource: string,
    public readonly currentUsage: number,
    public readonly limitValue: number | null,
    public readonly requestedIncrease = 1,
  ) {
    super({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource,
      currentUsage,
      limitValue,
      requestedIncrease,
      message:
        limitValue === null
          ? `The ${resource} resource is currently unavailable.`
          : `The ${resource} limit of ${limitValue} has been reached.`,
    });
  }
}

export class EntitlementUnavailableException extends ForbiddenException {
  constructor(message = "No active entitlement is available for this account.") {
    super({
      code: "ENTITLEMENT_UNAVAILABLE",
      message,
    });
  }
}
