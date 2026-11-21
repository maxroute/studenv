import { PrismaClient } from "@prisma/client";
import { isConnectionError, waitUntilReady, withConnectTimeout } from "@/lib/db/connection";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const databaseUrl = withConnectTimeout(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined);

/** How long a successful wake-up is trusted. Neon suspends idle compute after about 5 minutes. */
const READY_FOR_MS = 60_000;
let ready: Promise<void> | null = null;
let readyAt = 0;

/**
 * Wakes the database if it was idle. One cheap query, tried up to three times,
 * and remembered for a minute once it works, so a request after a long idle does not fail
 * on the first connection. A failure is not remembered: the next call tries again.
 */
export function ensureDatabaseReady() {
  if (!ready || (readyAt && Date.now() - readyAt > READY_FOR_MS)) {
    readyAt = 0;
    ready = waitUntilReady(() => prisma.$queryRaw`SELECT 1`).then(
      () => {
        readyAt = Date.now();
      },
      (error) => {
        ready = null;
        throw error;
      },
    );
  }
  return ready;
}

export { isConnectionError };

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
