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

export const updateTaskSchema = baseTaskSchema
  .partial()
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

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
