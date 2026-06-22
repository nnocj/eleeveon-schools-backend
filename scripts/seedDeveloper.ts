// ======================================================
// scripts/seedDeveloper.ts
// Run: DEVELOPER_EMAIL=you@email.com DEVELOPER_PASSWORD=yourpass npx tsx scripts/seedDeveloper.ts
// ======================================================

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as bcrypt from "bcryptjs";

const databaseUrlForSeed = process.env.DATABASE_URL;
if (!databaseUrlForSeed) throw new Error("DATABASE_URL is missing");

const prismaSeed = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrlForSeed }),
});

async function seedDeveloper() {
  const email = (process.env.DEVELOPER_EMAIL || "nicholascommey2001@gmail.com").toLowerCase().trim();
  const password = process.env.DEVELOPER_PASSWORD || "ChangeMe12345";
  const fullName = process.env.DEVELOPER_NAME || "Nicholas Commey";

  const passwordHash = await bcrypt.hash(password, 12);

  const account = await prismaSeed.account.upsert({
    where: { email },
    update: { name: "Eleeveon Platform", status: "active" },
    create: {
      name: "Eleeveon Platform",
      email,
      country: "GH",
      currency: "GHS",
      status: "active",
    },
  });

  const user = await prismaSeed.appUser.upsert({
    where: { email },
    update: { fullName, passwordHash, role: "developer", active: true, accountId: account.id },
    create: {
      accountId: account.id,
      fullName,
      email,
      passwordHash,
      role: "developer",
      active: true,
    },
  });

  await prismaSeed.userMembership.upsert({
    where: { id: `developer-${user.id}` },
    update: { active: true, role: "developer", accountId: account.id, userId: user.id },
    create: {
      id: `developer-${user.id}`,
      accountId: account.id,
      userId: user.id,
      role: "developer",
      active: true,
    },
  });

  console.log("✅ Developer seeded");
  console.log(`Email: ${email}`);
  console.log("Password:", password === "ChangeMe12345" ? "ChangeMe12345  (change this immediately)" : "from DEVELOPER_PASSWORD");
}

seedDeveloper()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prismaSeed.$disconnect();
  });
