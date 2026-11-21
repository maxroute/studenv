import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/** Questions used by `userId` on `day` (a UTC midnight). */
export async function getUsedCount(userId: string, day: Date): Promise<number> {
  const row = await prisma.ranganUsage.findUnique({
    where: { userId_day: { userId, day } },
    select: { count: true },
  });
  return row?.count ?? 0;
}

/**
 * Adds one to the day's count if it is still below `limit` and returns the new
 * count, or null when it is already at the limit (or there is no row yet). One
 * statement, so the count returned is the one this request made: a parallel
 * request can neither overspend the allowance nor change the number reported.
 * The day is passed as plain text ("2026-11-21"), so no time zone can shift it.
 */
async function incrementBelow(userId: string, day: Date, limit: number): Promise<number | null> {
  const date = day.toISOString().slice(0, 10);
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    UPDATE "RanganUsage"
    SET "count" = "count" + 1, "updatedAt" = NOW()
    WHERE "userId" = ${userId} AND "day" = ${date}::date AND "count" < ${limit}
    RETURNING "count"`;
  return rows[0]?.count ?? null;
}

/**
 * Takes one question from the day's allowance, and says how many the day has
 * used with it.
 */
export async function consumeQuestion(userId: string, day: Date, limit: number): Promise<{ allowed: boolean; used: number }> {
  const taken = await incrementBelow(userId, day, limit);
  if (taken !== null) return { allowed: true, used: taken };
  const existing = await getUsedCount(userId, day);
  if (existing > 0 || limit < 1) return { allowed: false, used: existing };
  try {
    await prisma.ranganUsage.create({ data: { userId, day, count: 1 } });
    return { allowed: true, used: 1 };
  } catch (error) {
    // Another request created the day's row first; count against it instead.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    const second = await incrementBelow(userId, day, limit);
    return second !== null ? { allowed: true, used: second } : { allowed: false, used: await getUsedCount(userId, day) };
  }
}

/** Gives a question back after every model failed, so a student is not charged for an outage. */
export async function refundQuestion(userId: string, day: Date): Promise<void> {
  await prisma.ranganUsage.updateMany({
    where: { userId, day, count: { gt: 0 } },
    data: { count: { decrement: 1 } },
  });
}
