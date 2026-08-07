import { SetMetadata } from "@nestjs/common";
import { REQUIRE_RESOURCE_KEY } from "../types/entitlement.constants";
import type { EntitlementResourceKey } from "../types/entitlement.types";

export interface RequiredResourceMetadata {
  resource: EntitlementResourceKey;
  increase: number;
}

export const RequireResource = (
  resource: EntitlementResourceKey,
  increase = 1,
) =>
  SetMetadata(REQUIRE_RESOURCE_KEY, {
    resource,
    increase,
  } satisfies RequiredResourceMetadata);
