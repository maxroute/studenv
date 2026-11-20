// ---------------------------------------------------------------------------
// Study plans: topics from the model, dates from code
// ---------------------------------------------------------------------------
//
// Pure: no model, database or React. The model only splits the material into
// topics in learning order with a rough effort; everything about dates is
// decided here, so a plan is predictable and testable.
//
// Days are calendar days written "YYYY-MM-DD". The planner stores a due date
// as UTC midnight of its calendar day and reads it back with UTC getters, so
// a session saved for "2026-11-24" shows on the 24th in every timezone.

import { z } from "zod";
import { extractJsonArray } from "@/lib/study/generation";

export const PLAN_MAX_SOURCES = 5;
export const PLAN_MAX_DAYS = 90;
export const PLAN_MAX_TOPICS = 16;
/** Shortest study or review session put on the calendar, in minutes. */
export const MIN_SESSION_MINUTES = 15;
/** Minutes a topic needs at each effort level, before it is fitted to the days available. */
export const EFFORT_MINUTES = { 1: 20, 2: 40, 3: 60 } as const;
/** Length of a quick review on a free day, at most. */
const QUICK_REVIEW_MINUTES = 20;

export type Effort = keyof typeof EFFORT_MINUTES;

export type PlanTopic = { title: string; cover: string; effort: Effort; passage: number | null };

export type PlanSession = {
  day: string;
  /** "study" learns a topic; "review" goes over topics already learned. */
  kind: "study" | "review";
  title: string;
  cover: string;
  minutes: number;
  /** Indexes of the topics this session covers. */
  topics: number[];
};

export type StudySchedule = {
  sessions: PlanSession[];
  /** True when the material needs more time than the days allow, so sessions were shortened. */
  tight: boolean;
  studyDays: number;
};

const DAY_MS = 86_400_000;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** UTC milliseconds of a "YYYY-MM-DD" day, or null when it is not a real date. */
export function parseDay(day: string): number | null {
  const match = DAY_PATTERN.exec(day);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, date);
  const check = new Date(ms);
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === date ? ms : null;
}

export function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Days from `start` to `end` inclusive, on the chosen weekdays (0 = Sunday). Empty when the range is invalid. */
export function studyDays(start: string, end: string, weekdays: readonly number[]): string[] {
  const from = parseDay(start);
  const to = parseDay(end);
  if (from === null || to === null || to < from) return [];
  const allowed = new Set(weekdays);
  const days: string[] = [];
  for (let ms = from; ms <= to && days.length <= PLAN_MAX_DAYS; ms += DAY_MS) {
    if (allowed.has(new Date(ms).getUTCDay())) days.push(formatDay(ms));
  }
  return days;
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Defaults for anything the student's sentence leaves out. */
export const DEFAULT_PLAN_DAYS = 14;
export const DEFAULT_MINUTES_PER_DAY = 45;
/** Sources Rangan picks by itself when the student names none. */
export const PLAN_AUTO_SOURCES = 3;

export type PlanSettings = { startDate: string; endDate: string; minutesPerDay: number; weekdays: number[] };

/**
 * The instruction for one model call that both reads the student's sentence
 * (goal, finish date, time per day, study days) and splits the passages into
 * topics, so a plan costs one question.
 */
export function planInstruction(request: string, today: string, sourceTitles: readonly string[], partial: boolean): string {
  const ms = parseDay(today) ?? Date.now();
  const sources = sourceTitles.map((title) => `"${title}"`).join(", ");
  return [
    `Today is ${WEEKDAY_NAMES[new Date(ms).getUTCDay()]}, ${today}. The student asked for a study plan:`,
    `"""${request}"""`,
    `The passages come from ${sources}.`,
    partial
      ? "The sources are long, so the passages are evenly spaced parts of them; plan for the whole of each source."
      : "The passages are the whole of the sources.",
    "1. Read the request. goal: a short name for what they are studying for, at most 6 words.",
    "finish: the last day to study, as YYYY-MM-DD: the day before an exam or deadline they name, or the date they give; null if they give none.",
    "minutesPerDay: the study time per day they ask for, in minutes; null if they give none.",
    'days: the days of the week they can study, from "mon" "tue" "wed" "thu" "fri" "sat" "sun"; null if they give none.',
    "2. Split the material into 3 to 12 topics, in the order to learn them: basics first, topics that build on others later.",
    "Only make topics that help with the goal. Skip passages that are not about it, even when they share a word with it.",
    "Merge small related ideas, so each topic is about one sitting of study. A short source gets fewer topics.",
    "title: a short name for the topic, at most 8 words. cover: one sentence saying what to learn.",
    "effort: 1 for a quick topic, 2 for a normal one, 3 for a hard or long one. passage: the number of the passage where the topic is found.",
    "Use only what the passages cover. Write in the language of the passages. Never mention passage numbers in the text.",
    'Reply with only a JSON object, no other text: {"goal": "...", "finish": "YYYY-MM-DD", "minutesPerDay": 60, "days": ["mon"], "topics": [{"title": "...", "cover": "...", "effort": 2, "passage": 1}]}',
  ].join("\n");
}

/** The first JSON object in a model reply, which may wrap it in a code fence or prose; null when there is none. */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const cleanText = (max: number) => z.string().transform((value) => value.replace(/\s+/g, " ").trim()).pipe(z.string().min(1).max(max));

const rawTopic = z.object({
  title: cleanText(120),
  cover: z.string().optional(),
  effort: z.unknown().optional(),
  passage: z.unknown().optional(),
});

function effortOf(value: unknown): Effort {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return n === 1 || n === 3 ? n : 2;
}

function passageIndex(value: unknown, passageCount: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n >= 1 && n <= passageCount ? n - 1 : null;
}

/** Well-formed, distinct topics, in order, at most {@link PLAN_MAX_TOPICS}. */
export function parsePlanTopics(entries: readonly unknown[], passageCount: number): PlanTopic[] {
  const seen = new Set<string>();
  const topics: PlanTopic[] = [];
  for (const entry of entries) {
    const parsed = rawTopic.safeParse(entry);
    if (!parsed.success) continue;
    const key = parsed.data.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push({
      title: parsed.data.title,
      cover: (parsed.data.cover ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
      effort: effortOf(parsed.data.effort),
      passage: passageIndex(parsed.data.passage, passageCount),
    });
    if (topics.length >= PLAN_MAX_TOPICS) break;
  }
  return topics;
}

export type PlanReply = {
  goal: string | null;
  endDate: string | null;
  minutesPerDay: number | null;
  weekdays: number[] | null;
  topics: PlanTopic[];
};

/** What the model read from the request, and its topics. A bare array of topics is accepted too. */
export function parsePlanReply(text: string, passageCount: number): PlanReply {
  // A reply that opens with "[" is a bare list of topics; its first "{" is a topic, not the plan.
  const bracket = text.indexOf("[");
  const brace = text.indexOf("{");
  const object = bracket !== -1 && (brace === -1 || bracket < brace) ? null : extractJsonObject(text);
  const entries = Array.isArray(object?.topics) ? object.topics : object ? [] : extractJsonArray(text);
  const goal = typeof object?.goal === "string" ? object.goal.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  const finish = typeof object?.finish === "string" && parseDay(object.finish.trim()) !== null ? object.finish.trim() : null;
  const minutes = typeof object?.minutesPerDay === "number" ? object.minutesPerDay : typeof object?.minutesPerDay === "string" ? Number(object.minutesPerDay) : Number.NaN;
  const days = Array.isArray(object?.days)
    ? [...new Set(object.days.map((day) => (typeof day === "string" ? WEEKDAY_KEYS.indexOf(day.trim().toLowerCase().slice(0, 3) as (typeof WEEKDAY_KEYS)[number]) : -1)).filter((day) => day >= 0))].sort()
    : [];
  return {
    goal: goal || null,
    endDate: finish,
    minutesPerDay: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
    weekdays: days.length ? days : null,
    topics: parsePlanTopics(entries, passageCount),
  };
}

/**
 * The plan's dates and time from what the model read, kept sensible: it
 * starts today, finishes within {@link PLAN_MAX_DAYS} days (two weeks when no
 * usable date was given), and always has at least one study day.
 */
export function resolvePlanSettings(today: string, reply: Pick<PlanReply, "endDate" | "minutesPerDay" | "weekdays">): PlanSettings {
  const start = parseDay(today) ?? Date.UTC(1970, 0, 1);
  const latest = start + (PLAN_MAX_DAYS - 1) * DAY_MS;
  const asked = reply.endDate ? parseDay(reply.endDate) : null;
  const end = asked === null || asked < start ? start + (DEFAULT_PLAN_DAYS - 1) * DAY_MS : Math.min(asked, latest);
  const minutes = reply.minutesPerDay === null ? DEFAULT_MINUTES_PER_DAY : Math.min(240, Math.max(MIN_SESSION_MINUTES, roundTo5(reply.minutesPerDay)));
  const settings = { startDate: formatDay(start), endDate: formatDay(end), minutesPerDay: minutes, weekdays: reply.weekdays ?? [0, 1, 2, 3, 4, 5, 6] };
  return studyDays(settings.startDate, settings.endDate, settings.weekdays).length > 0 ? settings : { ...settings, weekdays: [0, 1, 2, 3, 4, 5, 6] };
}

/** Words about when and how long, left out of the library search so they don't match unrelated notes. */
const SCHEDULE_WORDS = new Set(
  (
    "a an and the to for of on in at by my me i i'm im we our is it this that with about before after until till from " +
    "plan plans planning schedule timetable study studying revise revision help make create need want can could please " +
    "exam exams test tests quiz quizzes midterm mid-term final finals assignment deadline due ready " +
    "today tomorrow tonight day days daily week weeks weekly weekday weekdays weekend weekends month months every each next this " +
    "hour hours hr hrs minute minutes min mins time morning evening night " +
    "monday tuesday wednesday thursday friday saturday sunday mon tue tues wed thu thur thurs fri sat sun " +
    "january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec"
  ).split(" "),
);

/** The subject words of a plan request, for finding the student's material: "Biology test on Dec 4" → "Biology". */
export function planSearchQuery(request: string): string {
  return request
    .split(/[^\p{L}\p{M}\p{N}'-]+/u)
    .filter((word) => word && !SCHEDULE_WORDS.has(word.toLowerCase()) && !/^\p{N}+(st|nd|rd|th|h|m)?$/iu.test(word))
    .join(" ")
    .slice(0, 300);
}

/**
 * The sources a plan studies from, picked from library search results (best
 * first): always the best match's source, and others only when a passage of
 * theirs matched both by keyword and by meaning. A single shared word ("cell"
 * in a vocabulary book) is not enough to pull a source into the plan.
 */
export function pickPlanSources(
  results: ReadonlyArray<{ sourceType: string; sourceId: string; matchedBy: readonly string[] }>,
  max = PLAN_AUTO_SOURCES,
): Array<{ type: "note" | "asset"; id: string }> {
  const picked: Array<{ type: "note" | "asset"; id: string }> = [];
  const seen = new Set<string>();
  for (const result of results) {
    const type = result.sourceType === "note" ? "note" : result.sourceType === "pdf" || result.sourceType === "transcript" ? "asset" : null;
    // Articles and other shelf items are not study sources.
    if (!type || seen.has(result.sourceId)) continue;
    const strong = result.matchedBy.includes("keyword") && result.matchedBy.includes("meaning");
    if (picked.length > 0 && !strong) continue;
    seen.add(result.sourceId);
    picked.push({ type, id: result.sourceId });
    if (picked.length >= max) break;
  }
  return picked;
}

/** Sessions for a plan's topics and settings, each study session linked to its topic's source. Runs on the client too, so changing dates is free. */
export function buildPlanSessions<S>(topics: ReadonlyArray<Pick<PlanTopic, "title" | "cover" | "effort"> & { source: S | null }>, settings: PlanSettings) {
  const schedule = scheduleStudyPlan({ ...settings, topics });
  return {
    tight: schedule.tight,
    studyDays: schedule.studyDays,
    sessions: schedule.sessions.map(({ topics: covered, ...session }) => ({
      ...session,
      source: session.kind === "study" ? (topics[covered[0]]?.source ?? null) : null,
    })),
  };
}

const roundTo5 = (minutes: number) => Math.max(5, Math.round(minutes / 5) * 5);

const listTitles = (titles: readonly string[], max = 120) => {
  const joined = titles.join(", ");
  return joined.length <= max ? joined : `${joined.slice(0, max - 1).trimEnd()}…`;
};

export type ScheduleInput = {
  topics: ReadonlyArray<Pick<PlanTopic, "title" | "cover" | "effort">>;
  startDate: string;
  endDate: string;
  weekdays: readonly number[];
  minutesPerDay: number;
};

type Chunk = { topic: number; minutes: number };

/**
 * Topics packed into days of at most `perDay` minutes. A topic that fits in a
 * day is never split; a longer one is split into parts, none shorter than
 * {@link MIN_SESSION_MINUTES}.
 */
function packTopics(minutes: readonly number[], perDay: number): Chunk[][] {
  const buckets: Chunk[][] = [[]];
  let left = perDay;
  minutes.forEach((total, topic) => {
    let remaining = total;
    while (remaining > 0) {
      const current = buckets[buckets.length - 1];
      if (current.length > 0 && (left < MIN_SESSION_MINUTES || (remaining > left && remaining <= perDay))) {
        buckets.push([]);
        left = perDay;
        continue;
      }
      let take = Math.min(remaining, left);
      const rest = remaining - take;
      if (rest > 0 && rest < MIN_SESSION_MINUTES) {
        const shorter = take - (MIN_SESSION_MINUTES - rest);
        // Leave a full-length last part; when that is impossible, drop the few leftover minutes.
        if (shorter >= MIN_SESSION_MINUTES) take = shorter;
        else remaining = take;
      }
      current.push({ topic, minutes: take });
      remaining -= take;
      left -= take;
    }
  });
  return buckets;
}

/**
 * Puts topics on the calendar. The last days (about a fifth, at least one
 * when there are two or more) are kept for reviewing everything. Topics are
 * learned in order on the days before, spread out when there is room; a free
 * day between them gets a quick review of the topics learned last.
 */
export function scheduleStudyPlan(input: ScheduleInput): StudySchedule {
  const days = studyDays(input.startDate, input.endDate, input.weekdays);
  if (days.length === 0 || input.topics.length === 0) return { sessions: [], tight: false, studyDays: days.length };

  const perDay = Math.max(MIN_SESSION_MINUTES, input.minutesPerDay);
  const reviewCount = days.length >= 4 ? Math.max(1, Math.round(days.length * 0.2)) : days.length >= 2 ? 1 : 0;
  const learnDays = days.slice(0, days.length - reviewCount);
  const reviewDays = days.slice(days.length - reviewCount);

  const wanted = input.topics.map((topic) => EFFORT_MINUTES[topic.effort]);
  const capacity = learnDays.length * perDay;
  const total = wanted.reduce((sum, minutes) => sum + minutes, 0);
  const scale = total > capacity ? capacity / total : 1;
  const minutes = wanted.map((value) => Math.max(MIN_SESSION_MINUTES, roundTo5(value * scale)));

  const buckets = packTopics(minutes, perDay);
  let tight = total > capacity;
  // More full days than learning days: the extra work goes on the last learning day.
  if (buckets.length > learnDays.length) {
    tight = true;
    const extra = buckets.splice(learnDays.length - 1).flat();
    buckets.push(extra);
  }
  // Fewer full days than learning days: spread them evenly from the first day.
  const dayOf = (bucket: number) => Math.floor((bucket * learnDays.length) / buckets.length);

  const parts = new Map<number, number>();
  for (const chunk of buckets.flat()) parts.set(chunk.topic, (parts.get(chunk.topic) ?? 0) + 1);
  const seenParts = new Map<number, number>();

  const sessions: PlanSession[] = [];
  const usedDays = new Set<number>();
  buckets.forEach((bucket, index) => {
    const dayIndex = dayOf(index);
    usedDays.add(dayIndex);
    for (const chunk of bucket) {
      const topic = input.topics[chunk.topic];
      const of = parts.get(chunk.topic) ?? 1;
      const n = (seenParts.get(chunk.topic) ?? 0) + 1;
      seenParts.set(chunk.topic, n);
      sessions.push({
        day: learnDays[dayIndex],
        kind: "study",
        title: of > 1 ? `${topic.title} (part ${n} of ${of})` : topic.title,
        cover: topic.cover,
        minutes: chunk.minutes,
        topics: [chunk.topic],
      });
    }
  });

  // A free learning day reviews what was learned on the last study day before it.
  let lastStudied: number[] = [];
  const reviewed = new Set<string>();
  for (let dayIndex = 0; dayIndex < learnDays.length; dayIndex++) {
    if (usedDays.has(dayIndex)) {
      lastStudied = [...new Set(sessions.filter((session) => session.day === learnDays[dayIndex]).flatMap((session) => session.topics))];
      continue;
    }
    const key = lastStudied.join(",");
    if (lastStudied.length === 0 || reviewed.has(key)) continue;
    reviewed.add(key);
    sessions.push({
      day: learnDays[dayIndex],
      kind: "review",
      title: `Quick review: ${listTitles(lastStudied.map((topic) => input.topics[topic].title))}`,
      cover: "Go over what you learned last time and test yourself before moving on.",
      minutes: Math.min(QUICK_REVIEW_MINUTES, perDay),
      topics: lastStudied,
    });
  }

  // The final days go over every topic, split in order across them.
  const topicCount = input.topics.length;
  reviewDays.forEach((day, index) => {
    const from = Math.floor((index * topicCount) / reviewDays.length);
    const to = Math.floor(((index + 1) * topicCount) / reviewDays.length);
    const topics = Array.from({ length: Math.max(0, to - from) }, (_, offset) => from + offset);
    if (topics.length === 0) return;
    const final = index === reviewDays.length - 1;
    sessions.push({
      day,
      kind: "review",
      title: reviewDays.length === 1 ? "Final review" : `Review: ${listTitles(topics.map((topic) => input.topics[topic].title))}`,
      cover: final
        ? "Go over the main points and test yourself with flashcards or a quiz."
        : "Go over these topics and test yourself with flashcards or a quiz.",
      minutes: perDay,
      topics,
    });
  });

  sessions.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  return { sessions, tight, studyDays: days.length };
}

/** A planner task for one session, ready for `POST /api/planner/tasks/batch`. */
export function planSessionTask(session: Pick<PlanSession, "day" | "kind" | "title" | "cover" | "minutes">, goal: string, source: string | null) {
  const description = [session.cover, source ? `From: ${source}` : ""].filter(Boolean).join("\n\n");
  return {
    title: session.title.slice(0, 500),
    description: description ? description.slice(0, 2_000) : null,
    category: session.kind === "review" ? "Revision" : "Study",
    dueDate: `${session.day}T00:00:00.000Z`,
    estimatedDuration: session.minutes,
    notes: `Study plan: ${goal}`.slice(0, 5_000),
  };
}
