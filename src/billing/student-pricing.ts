/** Pricing configuration stored under SubscriptionPlan.metadata.pricing. */
export type PricingMode = "fixed" | "per_student" | "tiered";
export type StudentPricing = {
  mode: PricingMode;
  billingPeriod?: "monthly" | "termly" | "yearly";
  perStudentRate?: number;
  minimumAmount?: number;
  tiers?: Array<{ upTo: number | null; unitPrice: number }>;
};

const isNonnegative = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;

export function parseStudentPricing(metadata: unknown): StudentPricing {
  const source = (metadata && typeof metadata === "object" && !Array.isArray(metadata))
    ? (metadata as Record<string, unknown>).pricing : undefined;
  if (source == null) return { mode: "fixed" };
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Invalid pricing configuration.");
  const p = source as Record<string, any>;
  if (!["fixed", "per_student", "tiered"].includes(p.mode)) throw new Error("Invalid pricing mode.");
  if (p.mode === "fixed") return { mode: "fixed" };
  if (!["monthly", "termly", "yearly"].includes(p.billingPeriod)) throw new Error("A billing period is required for student pricing.");
  if (p.minimumAmount != null && !isNonnegative(p.minimumAmount)) throw new Error("Invalid minimum charge.");
  const base: StudentPricing = { mode: p.mode, billingPeriod: p.billingPeriod, minimumAmount: p.minimumAmount ?? 0 };
  if (p.mode === "per_student") {
    if (!isNonnegative(p.perStudentRate)) throw new Error("Invalid per-student price.");
    return { ...base, perStudentRate: p.perStudentRate };
  }
  if (!Array.isArray(p.tiers) || !p.tiers.length || p.tiers.length > 20) throw new Error("Student tiers are required (maximum 20). ");
  let last = 0;
  const tiers = p.tiers.map((tier: any, index: number) => {
    if (!tier || !isNonnegative(tier.unitPrice)) throw new Error("Invalid tier rate.");
    if (tier.upTo !== null && (!Number.isSafeInteger(tier.upTo) || tier.upTo <= last)) throw new Error("Tier thresholds must increase.");
    if (tier.upTo === null && index !== p.tiers.length - 1) throw new Error("Unlimited tier must be last.");
    if (tier.upTo !== null) last = tier.upTo;
    return { upTo: tier.upTo, unitPrice: tier.unitPrice };
  });
  if (tiers.at(-1)?.upTo !== null) throw new Error("Last tier must be unlimited.");
  return { ...base, tiers };
}

export function calculateStudentQuote(pricing: StudentPricing, students: number): number {
  if (!Number.isSafeInteger(students) || students < 1 || students > 1000000) throw new Error("Student count must be between 1 and 1,000,000.");
  let amount = 0;
  if (pricing.mode === "per_student") amount = students * (pricing.perStudentRate ?? 0);
  else if (pricing.mode === "tiered") {
    let assigned = 0;
    for (const tier of pricing.tiers || []) {
      const next = tier.upTo === null ? students : Math.min(students, tier.upTo);
      amount += Math.max(0, next - assigned) * tier.unitPrice;
      assigned = next;
      if (assigned >= students) break;
    }
    if (assigned < students) throw new Error("Student tiers do not cover the requested count.");
  } else throw new Error("Fixed pricing uses the subscription plan's existing fixed prices.");
  return Math.round(Math.max(amount, pricing.minimumAmount ?? 0) * 100) / 100;
}
