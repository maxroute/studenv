import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Keep backward compatibility for imports from collection.repository and base.repository
export function getPrismaClient() {
  return prisma;
}

/**
 * Limits for interactive transactions that run several queries. Prisma's
 * default (5 s) is too short when each round trip to the database region takes
 * a few hundred milliseconds; this keeps them bounded but realistic.
 */
export const INTERACTIVE_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;
