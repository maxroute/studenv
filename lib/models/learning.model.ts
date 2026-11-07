import { z } from "zod";

const externalUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Enter a valid HTTP or HTTPS URL.");

export const createCourseSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    providerName: z.string().trim().min(1).max(100),
    courseUrl: externalUrl,
    description: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

export const updateCourseSchema = createCourseSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const courseNodeTypeSchema = z.enum(["subject", "topic", "lecture"]);
const resourceId = z.string().trim().min(1).max(64);

export const createCourseNodeSchema = z
  .object({
    parentId: resourceId.optional().nullable(),
    type: courseNodeTypeSchema,
    title: z.string().trim().min(1).max(250),
    originalUrl: externalUrl.optional().nullable(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  })
  .strict();

export const updateCourseNodeSchema = createCourseNodeSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const saveCourseNotesSchema = z
  .object({ content: z.string().max(50000) })
  .strict();

export const createCourseResourceSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    url: externalUrl,
  })
  .strict();

export const attachCourseItemSchema = z
  .object({ itemId: z.string().trim().min(1).max(64) })
  .strict();

const generationAction = z
  .object({
    action: z.enum(["research", "explain", "notes", "flashcards"]),
    prompt: z.string().trim().min(1).max(4000),
    courseId: resourceId.optional().nullable(),
    courseNodeId: resourceId.optional().nullable(),
  })
  .strict();

const saveMaterialAction = z
  .object({
    action: z.literal("save_to_shelf"),
    title: z.string().trim().min(1).max(500),
    content: z.string().trim().min(1).max(50000),
    materialKind: z.enum(["explanation", "notes", "flashcards"]),
    courseNodeId: resourceId.optional().nullable(),
  })
  .strict();

const createRevisionTaskAction = z
  .object({
    action: z.literal("create_revision_task"),
    title: z.string().trim().min(1).max(500),
    courseNodeId: resourceId.optional().nullable(),
    dueDate: z.string().datetime({ offset: true }).optional().nullable(),
  })
  .strict();

export const ranganActionSchema = z.discriminatedUnion("action", [
  generationAction,
  saveMaterialAction,
  createRevisionTaskAction,
]);

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CreateCourseNodeInput = z.infer<typeof createCourseNodeSchema>;
export type UpdateCourseNodeInput = z.infer<typeof updateCourseNodeSchema>;
export type SaveCourseNotesInput = z.infer<typeof saveCourseNotesSchema>;
export type CreateCourseResourceInput = z.infer<typeof createCourseResourceSchema>;
export type RanganActionInput = z.infer<typeof ranganActionSchema>;
