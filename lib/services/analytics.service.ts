import { prisma } from "@/lib/db/prisma";

// ─── XP Constants ─────────────────────────────────────────────
const XP_FOCUS_COMPLETED = 10;
const XP_BREAK_COMPLETED = 5;
const XP_INTERRUPTED = 0;

// ─── Types ────────────────────────────────────────────────────
export type SessionType = "focus" | "shortBreak" | "longBreak";

export interface DashboardStats {
  totalSessions: number;
  focusSessions: number;
  breakSessions: number;
  totalFocusMs: number;
  totalBreakMs: number;
  todaySessions: number;
  todayFocusMs: number;
  todayBreakMs: number;
  todayFocusSessions: number;
  todayBreakSessions: number;
  weekSessions: number;
  weekFocusMs: number;
  monthSessions: number;
  monthFocusMs: number;
  averageSessionMs: number;
  longestSessionMs: number;
  currentStreak: number;
  longestStreak: number;
  totalXp: number;
  completionRate: number;
  productivityScore: number;
}

export interface DailyActivity {
  date: string;
  focusSessions: number;
  breakSessions: number;
  focusMs: number;
  breakMs: number;
}

export interface RecentSession {
  id: string;
  type: string;
  durationMs: number;
  status: string;
  goal: string | null;
  startedAt: Date;
  createdAt: Date;
}

// ─── XP Calculation (single source of truth) ──────────────────
export function calculateSessionXp(
  type: string,
  status: string,
): number {
  if (status !== "completed") return XP_INTERRUPTED;
  if (type === "focus") return XP_FOCUS_COMPLETED;
  if (type === "shortBreak" || type === "longBreak") return XP_BREAK_COMPLETED;
  return 0;
}

// ─── Date Helpers ─────────────────────────────────────────────
function startOfDayUTC(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfWeekUTC(date: Date = new Date()): Date {
  const d = startOfDayUTC(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function startOfMonthUTC(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ─── Streak Calculation (raw SQL, never manual counters) ──────
export async function calculateStreaks(userId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
}> {
  const rows = await prisma.$queryRaw<Array<{ session_date: string }>>`
    SELECT DISTINCT TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS session_date
    FROM "FocusSession"
    WHERE "userId" = ${userId}
      AND "status" = 'completed'
      AND "type" = 'focus'
    ORDER BY session_date DESC
  `;

  if (rows.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  const dates = rows.map((r) => r.session_date);
  const dateSet = new Set(dates);

  let currentStreak = 0;
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);

  const todayKey = formatDateKey(cursor);
  if (!dateSet.has(todayKey)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  while (true) {
    const key = formatDateKey(cursor);
    if (dateSet.has(key)) {
      currentStreak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      continue;
    }
    break;
  }

  let longestStreak = 0;
  let runningStreak = 0;
  const sorted = [...dates].sort();
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      runningStreak = 1;
    } else {
      const prev = new Date(sorted[i - 1]);
      const curr = new Date(sorted[i]);
      const diffDays = Math.round(
        (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays === 1) {
        runningStreak++;
      } else {
        runningStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, runningStreak);
  }

  return { currentStreak, longestStreak };
}

// ─── Raw SQL stats row type ───────────────────────────────────
interface RawStatsRow {
  total_completed: bigint;
  focus_completed: bigint;
  break_completed: bigint;
  total_focus_ms: bigint;
  total_break_ms: bigint;
  total_ms: bigint;
  today_completed: bigint;
  today_focus_ms: bigint;
  today_break_ms: bigint;
  today_focus_sessions: bigint;
  today_break_sessions: bigint;
  week_completed: bigint;
  week_focus_ms: bigint;
  month_completed: bigint;
  month_focus_ms: bigint;
  longest_session_ms: bigint;
  total_started: bigint;
}

// ─── Full Dashboard Stats (ONE optimized SQL query) ───────────
export async function getDashboardStats(
  userId: string,
): Promise<DashboardStats> {
  const now = new Date();
  const todayStart = startOfDayUTC(now);
  const weekStart = startOfWeekUTC(now);
  const monthStart = startOfMonthUTC(now);

  // Single optimized query replaces 14 separate Prisma queries
  const [statsRow] = await prisma.$queryRaw<RawStatsRow[]>`
    SELECT
      COUNT(*) FILTER (WHERE "status" = 'completed') AS total_completed,
      COUNT(*) FILTER (WHERE "status" = 'completed' AND "type" = 'focus') AS focus_completed,
      COUNT(*) FILTER (WHERE "status" = 'completed' AND "type" IN ('shortBreak', 'longBreak')) AS break_completed,
      COALESCE(SUM("durationMs") FILTER (WHERE "status" = 'completed' AND "type" = 'focus'), 0) AS total_focus_ms,
      COALESCE(SUM("durationMs") FILTER (WHERE "status" = 'completed' AND "type" IN ('shortBreak', 'longBreak')), 0) AS total_break_ms,
      COALESCE(SUM("durationMs") FILTER (WHERE "status" = 'completed'), 0) AS total_ms,
      COUNT(*) FILTER (WHERE "status" = 'completed' AND "createdAt" >= ${todayStart}) AS today_completed,
      COALESCE(SUM("durationMs") FILTER (WHERE "status" = 'completed' AND "type" = 'focus' AND "createdAt" >= ${todayStart}), 0) AS today_focus_ms,
      COALESCE(SUM("durationMs") FILTER (WHERE "status" = 'completed' AND "type" IN ('shortBreak', 'longBreak') AND "createdAt" >= ${todayStart}), 0) AS today_break_ms,
      COUNT(*) FILTER (WHERE "status" = 'completed' AND "type" = 'focus' AND "createdAt" >= ${todayStart}) AS today_focus_sessions,
      COUNT(*) FILTER (WHERE "status" = 'completed' AND "type" IN ('shortBreak', 'longBreak') AND "createdAt" >= ${todayStart}) AS today_break_sessions,
      COUNT(*) FILTER (WHERE "status" = 'completed' AND "createdAt" >= ${weekStart}) AS week_completed,
      COALESCE(SUM("durationMs") FILTER (WHERE "status" = 'completed' AND "type" = 'focus' AND "createdAt" >= ${weekStart}), 0) AS week_focus_ms,
      COUNT(*) FILTER (WHERE "status" = 'completed' AND "createdAt" >= ${monthStart}) AS month_completed,
      COALESCE(SUM("durationMs") FILTER (WHERE "status" = 'completed' AND "type" = 'focus' AND "createdAt" >= ${monthStart}), 0) AS month_focus_ms,
      COALESCE(MAX("durationMs") FILTER (WHERE "status" = 'completed' AND "type" = 'focus'), 0) AS longest_session_ms,
      COUNT(*) FILTER (WHERE "type" = 'focus') AS total_started
    FROM "FocusSession"
    WHERE "userId" = ${userId}
  `;

  const [streaks] = await Promise.all([
    calculateStreaks(userId),
  ]);

  const n = (v: bigint) => Number(v);
  const totalSessions = n(statsRow.total_completed);
  const focusSessions = n(statsRow.focus_completed);
  const breakSessions = n(statsRow.break_completed);
  const totalFocusMs = n(statsRow.total_focus_ms);
  const totalBreakMs = n(statsRow.total_break_ms);
  const totalMs = n(statsRow.total_ms);
  const totalStarted = n(statsRow.total_started);
  const averageSessionMs =
    totalSessions > 0 ? Math.round(totalMs / totalSessions) : 0;
  const completionRate =
    totalStarted > 0
      ? Math.round((focusSessions / totalStarted) * 100)
      : 0;

  // XP: computed from counts
  const totalXp =
    focusSessions * XP_FOCUS_COMPLETED + breakSessions * XP_BREAK_COMPLETED;

  // Productivity score
  const streakScore = Math.min(streaks.currentStreak / 7, 1) * 30;
  const completionScore = (completionRate / 100) * 40;
  const volumeScore =
    Math.min(totalFocusMs / (1000 * 60 * 60 * 10), 1) * 30;
  const productivityScore = Math.round(
    streakScore + completionScore + volumeScore,
  );

  return {
    totalSessions,
    focusSessions,
    breakSessions,
    totalFocusMs,
    totalBreakMs,
    todaySessions: n(statsRow.today_completed),
    todayFocusMs: n(statsRow.today_focus_ms),
    todayBreakMs: n(statsRow.today_break_ms),
    todayFocusSessions: n(statsRow.today_focus_sessions),
    todayBreakSessions: n(statsRow.today_break_sessions),
    weekSessions: n(statsRow.week_completed),
    weekFocusMs: n(statsRow.week_focus_ms),
    monthSessions: n(statsRow.month_completed),
    monthFocusMs: n(statsRow.month_focus_ms),
    averageSessionMs,
    longestSessionMs: n(statsRow.longest_session_ms),
    currentStreak: streaks.currentStreak,
    longestStreak: streaks.longestStreak,
    totalXp,
    completionRate,
    productivityScore,
  };
}

// ─── Weekly Activity (raw SQL, one query for all 7 days) ──────
interface RawDailyRow {
  day_date: string;
  focus_count: bigint;
  break_count: bigint;
  focus_ms: bigint;
  break_ms: bigint;
}

export async function getWeeklyActivity(
  userId: string,
): Promise<DailyActivity[]> {
  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  const rows = await prisma.$queryRaw<RawDailyRow[]>`
    SELECT
      TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day_date,
      COUNT(*) FILTER (WHERE "type" = 'focus') AS focus_count,
      COUNT(*) FILTER (WHERE "type" IN ('shortBreak', 'longBreak')) AS break_count,
      COALESCE(SUM("durationMs") FILTER (WHERE "type" = 'focus'), 0) AS focus_ms,
      COALESCE(SUM("durationMs") FILTER (WHERE "type" IN ('shortBreak', 'longBreak')), 0) AS break_ms
    FROM "FocusSession"
    WHERE "userId" = ${userId}
      AND "status" = 'completed'
      AND "createdAt" >= ${weekStart}
    GROUP BY day_date
    ORDER BY day_date ASC
  `;

  const rowMap = new Map(rows.map((r) => [r.day_date, r]));
  const days: DailyActivity[] = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = startOfDayUTC(now);
    d.setUTCDate(d.getUTCDate() - i);
    const key = formatDateKey(d);
    const row = rowMap.get(key);

    days.push({
      date: key,
      focusSessions: row ? Number(row.focus_count) : 0,
      breakSessions: row ? Number(row.break_count) : 0,
      focusMs: row ? Number(row.focus_ms) : 0,
      breakMs: row ? Number(row.break_ms) : 0,
    });
  }

  return days;
}

// ─── Recent Sessions (raw SQL) ────────────────────────────────
export async function getRecentSessions(
  userId: string,
  limit: number = 10,
): Promise<RecentSession[]> {
  return prisma.$queryRaw<RecentSession[]>`
    SELECT "id", "type", "durationMs", "status", "goal", "startedAt", "createdAt"
    FROM "FocusSession"
    WHERE "userId" = ${userId} AND "status" = 'completed'
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `;
}
