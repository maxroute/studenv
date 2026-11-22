import { z } from "zod";
import { REF_MAX_LENGTH } from "@/lib/refs/ref-grammar";
import { MIN_SESSION_MINUTES, parseDay, PLAN_MAX_DAYS, PLAN_MAX_SOURCES } from "@/lib/study/plan";

/** What a student can make flashcards and quizzes from. */
export type StudySourceKind = "note" | "pdf" | "video";

/** One source in the "Make from library" list. */
export type StudySource = { ref: string; kind: StudySourceKind; title: string };

/** Where a plan's topics come from: the student's own sources, or encyclopedia articles (`ref` is the article's link) when their library had nothing on it. */
export type PlanSource = { ref: string; kind: StudySourceKind | "web"; title: string };

/** Body of `POST /api/study/flashcards` and `POST /api/study/quiz`: the page (`note:<id>`), PDF or video (`asset:<id>`). */
export const studyRequestSchema = z.object({ ref: z.string().trim().min(1).max(REF_MAX_LENGTH) }).strict();

export type StudyRequest = z.infer<typeof studyRequestSchema>;

const planDay = z.string().refine((value) => parseDay(value) !== null, "Use a real date (YYYY-MM-DD).");

/** Dates and time of a plan, as the student set them. */
export const planSettingsSchema = z
  .object({
    startDate: planDay,
    endDate: planDay,
    minutesPerDay: z.number().int().min(MIN_SESSION_MINUTES).max(240),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Choose at least one day of the week.").max(7),
  })
  .strict()
  .superRefine((value, ctx) => {
    const start = parseDay(value.startDate);
    const end = parseDay(value.endDate);
    if (start === null || end === null) return;
    if (end < start) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "The finish date is before the start." });
    else if ((end - start) / 86_400_000 + 1 > PLAN_MAX_DAYS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: `A plan can cover at most ${PLAN_MAX_DAYS} days.` });
    }
  });

/**
 * Body of `POST /api/study/plan`: the student's request in their own words
 * ("Biology test on Dec 4, an hour on weekdays") and their calendar day.
 * Rangan finds the material and reads the dates unless `refs` or `settings`
 * say otherwise.
 */
export const studyPlanRequestSchema = z
  .object({
    request: z.string().trim().min(1, "Say what you're studying for.").max(500),
    today: planDay,
    refs: z.array(z.string().trim().min(1).max(REF_MAX_LENGTH)).min(1).max(PLAN_MAX_SOURCES).optional(),
    settings: planSettingsSchema.optional(),
  })
  .strict();

export type StudyPlanRequest = z.infer<typeof studyPlanRequestSchema>;
