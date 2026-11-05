/** Eleeveon commercial compatibility rules. Pure functions: safe for backend tests. */
export type CommercialAcquisition = "trial" | "subscription" | "complimentary" | "perpetual";
export type CanonicalDeployment = "connected" | "offline";
export type CanonicalSync = "full" | "platform_only" | "disabled";
export type CanonicalUpdate = "continuous" | "security_only" | "version_locked";

export function deploymentModeOf(value: unknown): CanonicalDeployment {
  const v = String(value ?? "").trim().toLowerCase();
  if (["offline", "offline_local", "independent_essentials", "independent_multi_device", "standalone", "local"].includes(v)) return "offline";
  return "connected"; // legacy eleeveon_cloud and connected
}
export function syncPolicyOf(value: unknown): CanonicalSync {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "full" ? "full" : ["platform_only", "hybrid"].includes(v) ? "platform_only" : "disabled";
}
export function updatePolicyOf(value: unknown): CanonicalUpdate {
  const v = String(value ?? "").trim().toLowerCase();
  return ["continuous", "security_only", "version_locked"].includes(v) ? v as CanonicalUpdate : "version_locked";
}
export function acquisitionOf(planModel: unknown, status: unknown): CommercialAcquisition {
  const model = String(planModel ?? "").toLowerCase();
  const state = String(status ?? "").toLowerCase();
  if (model === "complimentary" || model === "pilot") return "complimentary";
  if (model === "perpetual" || model === "outright") return "perpetual";
  if (model === "trial" || state === "trial") return "trial";
  return "subscription";
}
export type NormalizedAccessStatus = "active" | "trial" | "grace" | "past_due" | "expired" | "suspended" | "cancelled";
export function statusAt(input: { status: unknown; validUntil?: Date | string | null; graceEndsAt?: Date | string | null }, at = new Date()): NormalizedAccessStatus {
  const status = String(input.status ?? "").trim().toLowerCase();
  if (status === "suspended" || status === "revoked") return "suspended";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "expired" || status === "pending" || status === "unresolved") return "expired";
  const until = input.validUntil ? new Date(input.validUntil).getTime() : null;
  const grace = input.graceEndsAt ? new Date(input.graceEndsAt).getTime() : null;
  if (until !== null && (!Number.isFinite(until) || until <= at.getTime())) {
    if (grace !== null && Number.isFinite(grace) && grace > at.getTime()) return "grace";
    return "expired";
  }
  if (status === "active" || status === "trial" || status === "grace" || status === "past_due") return status;
  return "expired";
}
/** Active perpetual ownership is stronger than an unfinished/expired subscription. */
export function chooseCommercialBase(input: {
  subscriptionStatus?: unknown;
  subscriptionValidUntil?: Date | null;
  subscriptionGraceEndsAt?: Date | null;
  hasActivePerpetual: boolean;
  at?: Date;
}): "perpetual" | "subscription" | null {
  const at = input.at ?? new Date();
  if (input.hasActivePerpetual) return "perpetual";
  const state = statusAt({status: input.subscriptionStatus, validUntil: input.subscriptionValidUntil, graceEndsAt: input.subscriptionGraceEndsAt}, at);
  return state === "expired" || state === "cancelled" || state === "suspended" ? (input.subscriptionStatus ? "subscription" : null) : "subscription";
}
