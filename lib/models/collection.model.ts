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

const baseCollectionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  itemIds: z.array(resourceIdSchema).max(250).optional(),
});

export const createCollectionSchema = baseCollectionSchema.strict();

export const updateCollectionSchema = baseCollectionSchema
  .partial()
  .strict()
  .superRefine((value, ctx) => {
    if ("title" in value && !value.title?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["title"],
        message: "Collection title cannot be empty.",
      });
    }
  });

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
