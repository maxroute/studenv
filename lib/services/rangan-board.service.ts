import { parseRef } from "@/lib/refs/ref-grammar";
import { framedMap, layoutMap, mapDraftSchema, type MapSourceCard } from "@/lib/workspace/mind-map";
import { serializeWorkspaceScene } from "@/types/workspace";
import { z } from "zod";

/** Body of `POST /api/rangan/board`: a map draft Rangan wrote, its library sources, and the page written with it. */
export const createMapBoardSchema = z
  .object({
    draft: mapDraftSchema,
    sources: z.array(z.object({ n: z.number().int().positive(), ref: z.string().trim().min(1).max(420) }).strict()).max(8),
    pageNoteId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export type CreateMapBoardInput = z.infer<typeof createMapBoardSchema>;

export type RanganBoardDeps = {
  findNoteCard: (ownerId: string, noteId: string) => Promise<{ title: string; excerpt: string } | null>;
  findAssetCard: (ownerId: string, assetId: string) => Promise<{ title: string; kind: "pdf" | "video" } | null>;
  /** Creates the board with its first snapshot; returns its id. */
  createBoard: (ownerId: string, title: string, sceneJson: string) => Promise<string>;
  newId: () => string;
};

const BLOCK_ANCHOR = /^b_[A-Za-z0-9_-]{10}$/;

export function createRanganBoardService(deps: RanganBoardDeps) {
  /**
   * A new board with the map laid out on it. Cards are made only for the
   * user's own pages and files; a source that isn't theirs is left out. The
   * draft is the one the student looked at; it is checked again here.
   */
  async function createMapBoard(userId: string, input: CreateMapBoardInput): Promise<{ workspaceId: string }> {
    const sources = new Map<number, MapSourceCard>();
    for (const source of input.sources) {
      const ref = parseRef(source.ref);
      if (!ref) continue;
      if (ref.type === "note") {
        const card = await deps.findNoteCard(userId, ref.id);
        if (card) sources.set(source.n, { kind: "note", noteId: ref.id, ...card, ...(ref.anchor && BLOCK_ANCHOR.test(ref.anchor) ? { blockId: ref.anchor } : {}) });
      } else if (ref.type === "asset") {
        const card = await deps.findAssetCard(userId, ref.id);
        if (card) sources.set(source.n, { kind: "asset", assetId: ref.id, assetKind: card.kind, title: card.title });
      }
    }
    const page = input.pageNoteId ? await deps.findNoteCard(userId, input.pageNoteId) : null;
    const items = layoutMap(input.draft, { sources, ...(page && input.pageNoteId ? { page: { noteId: input.pageNoteId, ...page } } : {}), newId: deps.newId });
    const framed = framedMap(items);
    const sceneJson = serializeWorkspaceScene({ items: framed.items, viewport: framed.viewport });
    return { workspaceId: await deps.createBoard(userId, input.draft.title, sceneJson) };
  }

  return { createMapBoard };
}
