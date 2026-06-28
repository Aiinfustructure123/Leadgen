import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    // During build time or when no DB is configured, return a client that will
    // fail gracefully at runtime. We pass an empty adapter to satisfy the
    // constructor requirement.
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma =
  globalForPrisma.prisma ??
  (process.env.DATABASE_URL ? createPrismaClient() : ({} as PrismaClient));

if (process.env.NODE_ENV !== "production" && process.env.DATABASE_URL) {
  globalForPrisma.prisma = prisma;
}
