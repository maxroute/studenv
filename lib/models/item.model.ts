import { z } from "zod";

export const itemTypeEnum = z.enum(["article", "pdf", "video", "note"]);
export const itemStatusEnum = z.enum(["unread", "reading", "done"]);

const baseItemSchema = z.object({
  type: itemTypeEnum,
  title: z.string().min(1).max(500),
  url: z.string().trim().max(2000).optional().nullable(),
  excerpt: z.string().trim().max(5000).optional().nullable(),
  notes: z.string().trim().max(50000).optional().nullable(),
  status: itemStatusEnum.optional(),
  starred: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
});

export const createItemSchema = baseItemSchema
  .strict()
  .superRefine((value, ctx) => {
    if (value.type !== "note" && !value.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "A URL is required for non-note items.",
      });
    }
  });

export const updateItemSchema = baseItemSchema
  .partial()
  .strict()
  .superRefine((value, ctx) => {
    if ("title" in value && !value.title?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["title"],
        message: "Title cannot be empty.",
      });
    }
  });

export const itemQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    type: itemTypeEnum.optional(),
    status: itemStatusEnum.optional(),
    starred: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .optional()
      .transform((value) =>
        typeof value === "string" ? value === "true" : value,
      ),
    tag: z.string().trim().min(1).max(100).optional(),
    sort: z.enum(["newest", "oldest", "title", "updated"]).optional(),
    view: z.enum(["grid", "list"]).optional(),
  })
  .strict();

export const tagSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })
  .strict();

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ItemQueryInput = z.infer<typeof itemQuerySchema>;
export type TagInput = z.infer<typeof tagSchema>;
