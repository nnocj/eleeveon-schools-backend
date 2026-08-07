import "dotenv/config";

import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import {
  PrismaClient,
} from "@prisma/client";

import {
  PrismaPg,
} from "@prisma/adapter-pg";

/**
 * Always return a guaranteed string.
 * This satisfies both TypeScript and runtime safety.
 */
function requiredDatabaseUrl(): string {
  const value =
    process.env.DATABASE_URL?.trim();

  if (!value) {
    throw new Error(
      "DATABASE_URL is missing.",
    );
  }

  return value;
}

const databaseUrl =
  requiredDatabaseUrl();

/**
 * Keep one adapter for the lifetime of the process.
 */
const globalForPrisma =
  globalThis as unknown as {
    prismaAdapter?: PrismaPg;
  };

const prismaAdapter =
  globalForPrisma.prismaAdapter ??
  new PrismaPg({
    connectionString: databaseUrl,

    max: Number(
      process.env.DATABASE_POOL_SIZE ??
        3,
    ),

    connectionTimeoutMillis: 20_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
  });

if (
  process.env.NODE_ENV !== "production"
) {
  globalForPrisma.prismaAdapter =
    prismaAdapter;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements
    OnModuleInit,
    OnModuleDestroy
{
  constructor() {
    super({
      adapter: prismaAdapter,
      log:
        process.env.NODE_ENV ===
        "development"
          ? ["error", "warn"]
          : ["error"],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();

      // Verify the connection really works.
      await this.$queryRaw`SELECT 1`;

      console.log(
        "✅ Prisma connected to PostgreSQL",
      );
    } catch (error) {
      console.error(
        "❌ Prisma database connection failed",
        {
          host: safeDatabaseHost(),
          error,
        },
      );

      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();

    console.log(
      "❌ Prisma disconnected",
    );
  }
}

/**
 * Only logs the host/port.
 * Never logs credentials.
 */
function safeDatabaseHost(): string {
  try {
    const url = new URL(databaseUrl);

    return `${url.hostname}:${url.port}`;
  } catch {
    return "invalid DATABASE_URL";
  }
}