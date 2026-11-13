import { z } from "zod";

const id = z.string().trim().min(1).max(64);

export const createNoteSchema = z
  .object({
    title: z.string().max(2000).optional(),
    parentId: id.nullable().optional(),
    /** A full envelope; omitted for an empty note. */
    doc: z.unknown().optional(),
  })
  .strict();

export const saveNoteSchema = z
  .object({
    title: z.string().max(2000),
    doc: z.unknown(),
    /** The version the client's content is based on. */
    baseVersion: z.number().int().min(1),
    /** "Keep mine" after a conflict: snapshot the server copy, then save regardless of version. */
    overwrite: z.boolean().optional(),
  })
  .strict();

export const moveNoteSchema = z
  .object({
    parentId: id.nullable(),
    /** Sibling to place after; null or omitted for the first position. */
    afterId: id.nullable().optional(),
  })
  .strict();

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type SaveNoteInput = z.infer<typeof saveNoteSchema>;
export type MoveNoteInput = z.infer<typeof moveNoteSchema>;

export type NoteSummary = {
  id: string;
  title: string;
  parentId: string | null;
  sortKey: string;
  itemId: string | null;
  version: number;
  updatedAt: Date;
};

export type NoteDetail = NoteSummary & {
  /** The stored envelope, parsed; clients load it with parseNoteDoc. */
  doc: unknown;
  createdAt: Date;
  deletedAt: Date | null;
};
