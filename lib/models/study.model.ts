import { z } from "zod";
import { REF_MAX_LENGTH } from "@/lib/refs/ref-grammar";

/** What a student can make flashcards and quizzes from. */
export type StudySourceKind = "note" | "pdf" | "video";

/** One source in the "Make from library" list. */
export type StudySource = { ref: string; kind: StudySourceKind; title: string };

/** Body of `POST /api/study/flashcards` and `POST /api/study/quiz`: the page (`note:<id>`), PDF or video (`asset:<id>`). */
export const studyRequestSchema = z.object({ ref: z.string().trim().min(1).max(REF_MAX_LENGTH) }).strict();

export type StudyRequest = z.infer<typeof studyRequestSchema>;
