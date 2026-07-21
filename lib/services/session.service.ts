import { prisma } from "@/lib/db/prisma";
import { calculateSessionXp } from "./analytics.service";
import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────
export interface RecordSessionInput {
  userId: string;
  type: "focus" | "shortBreak" | "longBreak";
  durationMs: number;
  status: "completed" | "interrupted" | "cancelled";
  goal?: string | null;
  startedAt?: string | null; // ISO string
  taskId?: string | null;
}

export interface MigrationSessionInput {
  type: "focus" | "shortBreak" | "longBreak";
  durationMs: number;
  status: "completed";
  goal?: string | null;
  completedAt: string; // ISO string
}

const VALID_TYPES = new Set(["focus", "shortBreak", "longBreak"]);
const VALID_STATUSES = new Set(["completed", "interrupted", "cancelled"]);

// ─── Validation ───────────────────────────────────────────────
function validateSessionInput(input: RecordSessionInput): string | null {
  if (!input.userId || typeof input.userId !== "string") {
    return "Missing or invalid userId.";
  }
  if (!VALID_TYPES.has(input.type)) {
    return `Invalid session type: ${input.type}`;
  }
  if (!VALID_STATUSES.has(input.status)) {
    return `Invalid session status: ${input.status}`;
  }
  if (
    typeof input.durationMs !== "number" ||
    input.durationMs <= 0 ||
    input.durationMs > 24 * 60 * 60 * 1000 // max 24h
  ) {
    return "Invalid durationMs: must be a positive number under 24 hours.";
  }
  return null;
}

// ─── Record a Single Session (raw SQL) ────────────────────────
export async function recordSession(
  input: RecordSessionInput,
): Promise<{ id: string; xpAwarded: number }> {
  const error = validateSessionInput(input);
  if (error) {
    throw new Error(error);
  }

  const xpAwarded = calculateSessionXp(input.type, input.status);
  const id = randomUUID();

  const startedAt = input.startedAt
    ? new Date(input.startedAt)
    : new Date(Date.now() - input.durationMs);

  const goal = input.goal ?? null;
  const now = new Date();
  const taskId = input.taskId ?? null;

  await prisma.$executeRaw`
    INSERT INTO "FocusSession" ("id", "userId", "type", "durationMs", "status", "goal", "startedAt", "createdAt", "taskId")
    VALUES (${id}, ${input.userId}, ${input.type}, ${input.durationMs}, ${input.status}, ${goal}, ${startedAt}, ${now}, ${taskId})
  `;

  // Update user's lastStudyDate (for quick reference, not for streak calc)
  if (input.status === "completed" && input.type === "focus") {
    await prisma.user.update({
      where: { id: input.userId },
      data: { lastStudyDate: new Date() },
    }).catch((err) => {
      console.error("Failed to update lastStudyDate:", err);
    });

    // Update Task tracked duration & set status to in_progress
    if (taskId) {
      try {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          select: { trackedDuration: true, status: true },
        });
        if (task) {
          const updateData: Record<string, any> = {
            trackedDuration: task.trackedDuration + input.durationMs,
          };
          if (task.status === "pending") {
            updateData.status = "in_progress";
          }
          await prisma.task.update({
            where: { id: taskId },
            data: updateData,
          });
        }
      } catch (err) {
        console.error("Failed to update task trackedDuration:", err);
      }
    }
  }

  return { id, xpAwarded };
}

// ─── Get User Sessions (raw SQL) ─────────────────────────────
interface RawSession {
  id: string;
  type: string;
  durationMs: number;
  status: string;
  goal: string | null;
  startedAt: Date;
  createdAt: Date;
}

export async function getUserSessions(
  userId: string,
  options: {
    limit?: number;
    offset?: number;
    type?: string;
    status?: string;
  } = {},
) {
  const { limit = 20, offset = 0, type, status } = options;

  // Build dynamic WHERE conditions using raw SQL
  // Note: We pass all parameters and handle filtering in SQL with CASE/AND
  const filterType = type && VALID_TYPES.has(type) ? type : null;
  const filterStatus = status && VALID_STATUSES.has(status) ? status : null;

  const sessions = await prisma.$queryRaw<RawSession[]>`
    SELECT "id", "type", "durationMs", "status", "goal", "startedAt", "createdAt"
    FROM "FocusSession"
    WHERE "userId" = ${userId}
      AND (${filterType}::text IS NULL OR "type" = ${filterType})
      AND (${filterStatus}::text IS NULL OR "status" = ${filterStatus})
    ORDER BY "createdAt" DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM "FocusSession"
    WHERE "userId" = ${userId}
      AND (${filterType}::text IS NULL OR "type" = ${filterType})
      AND (${filterStatus}::text IS NULL OR "status" = ${filterStatus})
  `;

  return { sessions, total: Number(countResult[0].count) };
}

// ─── Update Session Goal (raw SQL) ────────────────────────────
export async function updateSessionGoal(
  userId: string,
  sessionId: string,
  goal: string,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "FocusSession"
    SET "goal" = ${goal}
    WHERE "id" = ${sessionId} AND "userId" = ${userId}
  `;
}

// ─── Idempotency Check (raw SQL) ─────────────────────────────
async function sessionExistsNear(
  userId: string,
  type: string,
  durationMs: number,
  completedAt: Date,
): Promise<boolean> {
  const windowMs = 2 * 60 * 1000;
  const windowStart = new Date(completedAt.getTime() - windowMs);
  const windowEnd = new Date(completedAt.getTime() + windowMs);

  const result = await prisma.$queryRaw<[{ exists: boolean }]>`
    SELECT EXISTS(
      SELECT 1 FROM "FocusSession"
      WHERE "userId" = ${userId}
        AND "type" = ${type}
        AND "durationMs" = ${durationMs}
        AND "createdAt" >= ${windowStart}
        AND "createdAt" <= ${windowEnd}
    ) as exists
  `;

  return result[0].exists;
}

// ─── Migrate from localStorage (raw SQL) ─────────────────────
const MIGRATION_FLAG = "second-brain-analytics-migrated";

export async function migrateFromLocalStorage(
  userId: string,
  localStorageData: {
    logs?: Array<{
      id: string;
      type: "focus" | "shortBreak" | "longBreak";
      minutes: number;
      completedAt: string;
      goal?: string;
    }>;
    dailyStats?: Record<
      string,
      {
        completedFocus?: number;
        completedBreaks?: number;
        focusMinutes?: number;
        breakMinutes?: number;
      }
    >;
  },
): Promise<{ migrated: number; skipped: number }> {
  let migrated = 0;
  let skipped = 0;

  // Check if user already has sessions (skip if so)
  const existingResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "FocusSession" WHERE "userId" = ${userId}
  `;
  const existingCount = Number(existingResult[0].count);

  if (existingCount > 0) {
    return { migrated: 0, skipped: 0 };
  }

  const logs = localStorageData.logs ?? [];

  for (const log of logs) {
    try {
      if (!log.completedAt || !log.type || !log.minutes) {
        skipped++;
        continue;
      }

      const completedAt = new Date(log.completedAt);
      if (isNaN(completedAt.getTime())) {
        skipped++;
        continue;
      }

      const durationMs = log.minutes * 60 * 1000;

      const exists = await sessionExistsNear(
        userId,
        log.type,
        durationMs,
        completedAt,
      );

      if (exists) {
        skipped++;
        continue;
      }

      const startedAt = new Date(completedAt.getTime() - durationMs);
      const id = randomUUID();
      const goal = log.goal ?? null;

      await prisma.$executeRaw`
        INSERT INTO "FocusSession" ("id", "userId", "type", "durationMs", "status", "goal", "startedAt", "createdAt")
        VALUES (${id}, ${userId}, ${log.type}, ${durationMs}, 'completed', ${goal}, ${startedAt}, ${completedAt})
      `;

      migrated++;
    } catch (err) {
      console.error("Migration error for log entry:", log.id, err);
      skipped++;
    }
  }

  return { migrated, skipped };
}
