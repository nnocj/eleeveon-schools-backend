import { SetMetadata } from "@nestjs/common";
import { REQUIRE_FEATURE_KEY } from "../types/entitlement.constants";
import type { EntitlementFeatureKey } from "../types/entitlement.types";

export const RequireFeature = (
  feature: EntitlementFeatureKey,
) => SetMetadata(REQUIRE_FEATURE_KEY, feature);
