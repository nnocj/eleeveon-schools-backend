import "dotenv/config";

import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing");
}

/**
 * Keep one adapter/pool for the lifetime of the Node process.
 *
 * Prisma 7 driver adapters use the underlying PostgreSQL driver's
 * connection-pool configuration.
 */
const globalForPrisma = globalThis as unknown as {
  prismaAdapter?: PrismaPg;
};

const prismaAdapter =
  globalForPrisma.prismaAdapter ??
  new PrismaPg({
    connectionString: databaseUrl,

    // Your database allows 15 sessions, so leave spare capacity
    // for migrations, Prisma Studio and administrative connections.
    max: Number(process.env.DATABASE_POOL_SIZE || 5),

    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaAdapter = prismaAdapter;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: prismaAdapter,
      log:
        process.env.NODE_ENV === "development"
          ? ["error", "warn"]
          : ["error"],
    });
  }

  async onModuleInit() {
    await this.$connect();
    console.log("✅ Prisma connected");
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log("❌ Prisma disconnected");
  }
}