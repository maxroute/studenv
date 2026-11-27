import { z } from "zod";

const CUID_REGEX = /^c[a-z0-9]{24,}$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resourceIdSchema = z
  .string()
  .trim()
  .refine(
    (value) => CUID_REGEX.test(value) || UUID_REGEX.test(value),
    "Invalid resource id.",
  );

const baseTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(500),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["pending", "in_progress", "completed", "cancelled", "missed"]).default("pending"),
  category: z.string().trim().max(50).default("study"),
  dueDate: z.string().trim().datetime({ offset: true }).or(z.string().trim().datetime()).or(z.date()).optional().nullable().transform(val => {
    if (!val) return null;
    return new Date(val);
  }),
  dueTime: z.string().trim().regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format.").optional().nullable(),
  estimatedDuration: z.number().int().nonnegative().optional().nullable(),
  notificationEnabled: z.boolean().default(true),
  repeat: z.enum(["none", "daily", "weekdays", "weekly", "monthly", "custom"]).default("none"),
  color: z.string().trim().max(20).optional().nullable(),
  icon: z.string().trim().max(50).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

export const createTaskSchema = baseTaskSchema.strict();

/** Most tasks added in one request: a 90-day study plan fits well within it. */
export const MAX_BATCH_TASKS = 200;

export const createTasksSchema = z.object({
  tasks: z.array(createTaskSchema).min(1).max(MAX_BATCH_TASKS),
}).strict();

/** The student's own calendar day, sent with date changes so missed days follow their clock. */
const todaySchema = z.string().datetime().optional();

export const updateTaskSchema = baseTaskSchema
  .partial()
  .extend({ today: todaySchema })
  .strict()
  .superRefine((value, ctx) => {
    if ("title" in value && !value.title?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["title"],
        message: "Task title cannot be empty.",
      });
    }
  });

export const reorderTasksSchema = z.object({
  taskIds: z.array(resourceIdSchema).max(1000)
}).strict();

/** Most tasks moved in one request. */
export const MAX_RESCHEDULE_TASKS = 500;

/** New dates for several tasks at once (clearing a backlog, and undoing it). */
export const rescheduleTasksSchema = z.object({
  changes: z.array(z.object({
    id: resourceIdSchema,
    dueDate: z.string().datetime().nullable(),
    dueTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format.").nullable(),
  }).strict()).min(1).max(MAX_RESCHEDULE_TASKS),
  today: z.string().datetime().optional(),
}).strict();

/** The longest stretch of focus history one request may read: a month with spare days. */
export const MAX_HISTORY_DAYS = 62;

export const focusHistoryQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
}).strict().refine(({ from, to }) => {
  const span = Date.parse(to) - Date.parse(from);
  return span > 0 && span <= MAX_HISTORY_DAYS * 86_400_000;
}, `Choose a range of up to ${MAX_HISTORY_DAYS} days.`);

export type RescheduleInput = z.infer<typeof rescheduleTasksSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
