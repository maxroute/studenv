"use client";

import { mutate } from "swr";
import type { StudyPlanResult } from "@/lib/services/study.service";
import { buildPlanSessions, planSessionTask, type PlanSettings } from "@/lib/study/plan";
import { reportUsage } from "@/lib/client/usage-bus";

// Shared by the Planner's "Plan with Rangan" dialog and the plan card in the
// Rangan chat.

export type PlanSessionView = ReturnType<typeof buildPlanSessions<StudyPlanResult["topics"][number]["source"]>>["sessions"][number];

/** The planner's task list, refreshed after a plan is added. */
const TASKS_KEY = "/api/planner/tasks";

/** The student's own calendar day, "YYYY-MM-DD". */
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** "Mon, 23 Nov" for a calendar day; read in UTC so it never shifts a day. */
export function dayLabel(day: string, withWeekday = true) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    ...(withWeekday ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

/** "Every day", "Mon–Fri", "Weekends" or "Mon, Wed, Fri". */
export function weekdaysLabel(weekdays: readonly number[]) {
  const set = new Set(weekdays);
  if (set.size === 7) return "every day";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((day) => set.has(day))) return "Mon–Fri";
  if (set.size === 2 && set.has(0) && set.has(6)) return "weekends";
  return [1, 2, 3, 4, 5, 6, 0].filter((day) => set.has(day)).map((day) => WEEKDAY_SHORT[day]).join(", ");
}

/** "Until Thu, 3 Dec · 1 h a day · Mon–Fri" */
export function settingsSummary(settings: PlanSettings) {
  return `Until ${dayLabel(settings.endDate)} · ${minutesLabel(settings.minutesPerDay)} a day · ${weekdaysLabel(settings.weekdays)}`;
}

export function planSessions(plan: StudyPlanResult, settings: PlanSettings = plan.settings) {
  return buildPlanSessions(plan.topics, settings);
}

type ApiResult<T> = { ok: boolean; status: number; data?: T; error?: string; details?: unknown };

async function call<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => null);
    reportUsage(json);
    return { ok: response.ok && Boolean(json?.ok), status: response.status, data: json?.data, error: json?.error, details: json?.details };
  } catch {
    return { ok: false, status: 0, error: "You seem to be offline. Check your connection and try again." };
  }
}

export type PlanRequestBody = { request: string; refs?: string[]; settings?: PlanSettings };

/** Asks Rangan for a plan. Uses one daily question when it succeeds. */
export async function requestStudyPlan(body: PlanRequestBody) {
  const result = await call<StudyPlanResult>("/api/study/plan", { ...body, today: localDay() });
  const needSources = typeof result.details === "object" && result.details !== null && (result.details as { needSources?: unknown }).needSources === true;
  if (result.ok && result.data) return { ok: true as const, plan: result.data };
  let message: string;
  if (result.status === 0) message = result.error ?? "You seem to be offline.";
  else if (result.status === 400 || result.status === 404 || result.status === 429) message = result.error ?? "That did not work.";
  else message = "Rangan couldn't plan that right now, so your question was given back. Please try again in a minute.";
  return { ok: false as const, status: result.status, message, needSources };
}

/** Adds the sessions to the planner as ordinary tasks, all or none. */
export async function saveStudyPlan(goal: string, sessions: readonly PlanSessionView[]) {
  const tasks = sessions.map((session) => planSessionTask(session, goal, session.source?.label ?? null));
  const result = await call<unknown[]>("/api/planner/tasks/batch", { tasks });
  if (!result.ok) {
    return { ok: false as const, message: result.status === 0 ? result.error ?? "You seem to be offline." : result.error ?? "The sessions could not be added. Please try again." };
  }
  void mutate(TASKS_KEY);
  return { ok: true as const };
}
