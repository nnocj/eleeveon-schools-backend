// ======================================================
// scripts/seedPlans.ts
// Run: npx tsx scripts/seedPlans.ts
// ======================================================

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrlForSeed = process.env.DATABASE_URL;
if (!databaseUrlForSeed) throw new Error("DATABASE_URL is missing");

const prismaSeed = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrlForSeed }),
});

async function upsertPlan(data: any) {
  return prismaSeed.subscriptionPlan.upsert({
    where: { code: data.code },
    update: data,
    create: data,
  });
}

async function seedPlans() {
  await upsertPlan({
    name: "Trial",
    code: "trial",
    description: "Free trial plan for testing Eleeveon.",
    currency: "GHS",
    priceMonthly: 0,
    priceYearly: 0,
    maxSchools: 1,
    maxBranches: 1,
    maxUsers: 3,
    maxStudents: 50,
    maxTeachers: 5,
    maxStorageMb: 250,
    offlineSync: true,
    cloudBackup: true,
    reports: true,
    finance: false,
    parentPortal: false,
    studentPortal: false,
    teacherPortal: true,
    advancedAnalytics: false,
    apiAccess: false,
    active: true,
  });

  await upsertPlan({
    name: "Starter",
    code: "starter",
    description: "Small school package.",
    currency: "GHS",
    priceMonthly: 150,
    priceYearly: 1500,
    maxSchools: 1,
    maxBranches: 1,
    maxUsers: 10,
    maxStudents: 200,
    maxTeachers: 20,
    maxStorageMb: 1000,
    offlineSync: true,
    cloudBackup: true,
    reports: true,
    finance: true,
    parentPortal: false,
    studentPortal: false,
    teacherPortal: true,
    advancedAnalytics: false,
    apiAccess: false,
    active: true,
  });

  await upsertPlan({
    name: "Standard",
    code: "standard",
    description: "Growing school package.",
    currency: "GHS",
    priceMonthly: 300,
    priceYearly: 3000,
    maxSchools: 1,
    maxBranches: 3,
    maxUsers: 30,
    maxStudents: 800,
    maxTeachers: 80,
    maxStorageMb: 5000,
    offlineSync: true,
    cloudBackup: true,
    reports: true,
    finance: true,
    parentPortal: true,
    studentPortal: true,
    teacherPortal: true,
    advancedAnalytics: true,
    apiAccess: false,
    active: true,
  });

  await upsertPlan({
    name: "Premium",
    code: "premium",
    description: "Multi-branch advanced package.",
    currency: "GHS",
    priceMonthly: 600,
    priceYearly: 6000,
    maxSchools: 3,
    maxBranches: 10,
    maxUsers: 100,
    maxStudents: 3000,
    maxTeachers: 300,
    maxStorageMb: 20000,
    offlineSync: true,
    cloudBackup: true,
    reports: true,
    finance: true,
    parentPortal: true,
    studentPortal: true,
    teacherPortal: true,
    advancedAnalytics: true,
    apiAccess: true,
    active: true,
  });

  await upsertPlan({
    name: "Enterprise",
    code: "enterprise",
    description: "Large institution and custom deployment package.",
    currency: "GHS",
    priceMonthly: 1200,
    priceYearly: 12000,
    maxSchools: null,
    maxBranches: null,
    maxUsers: null,
    maxStudents: null,
    maxTeachers: null,
    maxStorageMb: null,
    offlineSync: true,
    cloudBackup: true,
    reports: true,
    finance: true,
    parentPortal: true,
    studentPortal: true,
    teacherPortal: true,
    advancedAnalytics: true,
    apiAccess: true,
    active: true,
  });

  console.log("✅ Subscription plans seeded");
}

seedPlans()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prismaSeed.$disconnect();
  });
