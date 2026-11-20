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

async function incrementBelow(userId: string, day: Date, limit: number) {
  const updated = await prisma.ranganUsage.updateMany({
    where: { userId, day, count: { lt: limit } },
    data: { count: { increment: 1 } },
  });
  return updated.count === 1;
}

/**
 * Takes one question from the day's allowance. The check and the increment
 * are a single conditional UPDATE, so parallel requests cannot overspend it.
 */
export async function consumeQuestion(userId: string, day: Date, limit: number): Promise<{ allowed: boolean; used: number }> {
  if (await incrementBelow(userId, day, limit)) {
    return { allowed: true, used: await getUsedCount(userId, day) };
  }
  const existing = await getUsedCount(userId, day);
  if (existing > 0 || limit < 1) return { allowed: false, used: existing };
  try {
    await prisma.ranganUsage.create({ data: { userId, day, count: 1 } });
    return { allowed: true, used: 1 };
  } catch (error) {
    // Another request created the day's row first; count against it instead.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    const allowed = await incrementBelow(userId, day, limit);
    return { allowed, used: await getUsedCount(userId, day) };
  }
}

/** Gives a question back after every model failed, so a student is not charged for an outage. */
export async function refundQuestion(userId: string, day: Date): Promise<void> {
  await prisma.ranganUsage.updateMany({
    where: { userId, day, count: { gt: 0 } },
    data: { count: { decrement: 1 } },
  });
}
