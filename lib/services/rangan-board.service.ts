import { parseRef } from "@/lib/refs/ref-grammar";
import { isCommonsFilePage, isCommonsImageUrl, isWikipediaArticleUrl } from "@/lib/web/wikimedia-images";
import { YOUTUBE_VIDEO_ID } from "@/lib/web/youtube-search";
import { framedMap, layoutMap, MAP_MAX_IMAGES, MAP_MAX_READING, mapDraftSchema, type MapReadingCard, type MapSourceCard, type MapVideoCard } from "@/lib/workspace/mind-map";
import { asBlock, layoutSection, MEDIA_MAX_IMAGES, MEDIA_MAX_VIDEOS, SECTION_PLAN_MAX, sectionDraftSchema, stackBlocks, type SectionLayout } from "@/lib/workspace/board-sections";
import { serializeWorkspaceScene } from "@/types/workspace";
import { z } from "zod";

const mapImageSchema = z
  .object({
    target: z.string().max(60),
    src: z.string().max(1_000).refine(isCommonsImageUrl, "Pictures must come from Wikimedia Commons."),
    width: z.number().int().positive().max(10_000),
    height: z.number().int().positive().max(10_000),
    alt: z.string().trim().min(1).max(120),
    credit: z.string().trim().min(1).max(130),
    sourceUrl: z.string().max(1_000).refine(isCommonsFilePage, "A picture's source must be its Commons page."),
  })
  .strict();

const videoSchema = z.object({ videoId: z.string().regex(YOUTUBE_VIDEO_ID), title: z.string().trim().min(1).max(200), channel: z.string().max(120) }).strict();

const readingSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    url: z.string().max(1_000).refine(isWikipediaArticleUrl, "Further reading must be a Wikipedia article."),
  })
  .strict();

/** Body of `POST /api/rangan/board`: a map draft Rangan wrote, its library sources, pictures and reading, and the page written with it. */
export const createMapBoardSchema = z
  .object({
    draft: mapDraftSchema,
    sources: z.array(z.object({ n: z.number().int().positive(), ref: z.string().trim().min(1).max(420) }).strict()).max(8),
    pageNoteId: z.string().trim().min(1).max(128).optional(),
    images: z.array(mapImageSchema).max(MAP_MAX_IMAGES).default([]),
    reading: z.array(readingSchema).max(MAP_MAX_READING).default([]),
    video: videoSchema.nullable().default(null),
    /** Diagrams under the map. Boards drafted before sections existed have none. */
    sections: z.array(sectionDraftSchema).max(SECTION_PLAN_MAX).default([]),
    videos: z.array(videoSchema).max(MEDIA_MAX_VIDEOS).default([]),
    pictures: z.array(mapImageSchema.omit({ target: true })).max(MEDIA_MAX_IMAGES).default([]),
  })
  .strict();

/** What the board is made from; fields added later are optional, so drafts saved before them still work. */
export type CreateMapBoardInput = z.infer<typeof createMapBoardSchema>;
type CreateMapBoardRequest = Omit<CreateMapBoardInput, "sections" | "videos" | "pictures"> & Partial<Pick<CreateMapBoardInput, "sections" | "videos" | "pictures">>;

export type RanganBoardDeps = {
  findNoteCard: (ownerId: string, noteId: string) => Promise<{ title: string; excerpt: string } | null>;
  findAssetCard: (ownerId: string, assetId: string) => Promise<AssetCard | null>;
  /** The file a Shelf item is stored as, or null when the item isn't the user's or has none. */
  findItemCard: (ownerId: string, itemId: string) => Promise<(AssetCard & { assetId: string }) | null>;
  /** A web page in the user's library as a link: the one already saved at `url`, or a new one. */
  saveLink: (ownerId: string, link: { url: string; title: string }) => Promise<MapReadingCard>;
  /** A YouTube video in the user's library: the one already saved, or a new one (its transcript is fetched after). */
  saveVideo: (ownerId: string, video: { videoId: string; title: string }) => Promise<MapVideoCard>;
  /** Creates the board with its first snapshot; returns its id. */
  createBoard: (ownerId: string, title: string, sceneJson: string) => Promise<string>;
  newId: () => string;
};

type AssetCard = { title: string; kind: "pdf" | "video" | "audio" | "webpage"; sourceHost?: string };

const BLOCK_ANCHOR = /^b_[A-Za-z0-9_-]{10}$/;

export function createRanganBoardService(deps: RanganBoardDeps) {
  /**
   * A new board with the map laid out on it. Cards are made only for the
   * user's own pages and files; a source that isn't theirs is left out. The
   * draft is the one the student looked at; it is checked again here.
   */
  async function createMapBoard(userId: string, input: CreateMapBoardRequest): Promise<{ workspaceId: string }> {
    const sources = new Map<number, MapSourceCard>();
    for (const source of input.sources) {
      const ref = parseRef(source.ref);
      if (!ref) continue;
      if (ref.type === "note") {
        const card = await deps.findNoteCard(userId, ref.id);
        if (card) sources.set(source.n, { kind: "note", noteId: ref.id, ...card, ...(ref.anchor && BLOCK_ANCHOR.test(ref.anchor) ? { blockId: ref.anchor } : {}) });
      } else if (ref.type === "asset") {
        const card = await deps.findAssetCard(userId, ref.id);
        if (card) sources.set(source.n, { kind: "asset", assetId: ref.id, assetKind: card.kind, title: card.title, ...(card.sourceHost ? { sourceHost: card.sourceHost } : {}) });
      } else if (ref.type === "item") {
        const card = await deps.findItemCard(userId, ref.id);
        if (card) sources.set(source.n, { kind: "asset", assetId: card.assetId, assetKind: card.kind, title: card.title, ...(card.sourceHost ? { sourceHost: card.sourceHost } : {}) });
      }
    }
    const page = input.pageNoteId ? await deps.findNoteCard(userId, input.pageNoteId) : null;
    // Only pictures for the centre or a branch of this map; one each.
    const targets = new Set(["", ...input.draft.branches.map((branch) => branch.title.toLowerCase())]);
    const images = input.images.filter((image, index, all) => targets.has(image.target.toLowerCase()) && all.findIndex((other) => other.target.toLowerCase() === image.target.toLowerCase()) === index);
    // The Wikipedia articles used are saved as links, so their cards open like any web page.
    const reading: MapReadingCard[] = [];
    const saved = new Set<string>();
    for (const link of input.reading) {
      if (saved.has(link.url)) continue;
      saved.add(link.url);
      reading.push(await deps.saveLink(userId, link));
    }
    const video = input.video ? await deps.saveVideo(userId, { videoId: input.video.videoId, title: input.video.title }) : undefined;
    const items = layoutMap(input.draft, {
      sources,
      images,
      reading,
      ...(video ? { video } : {}),
      ...(page && input.pageNoteId ? { page: { noteId: input.pageNoteId, ...page } } : {}),
      newId: deps.newId,
    });
    const framed = framedMap(items);
    // Under the map: the diagrams, then more videos and pictures, each with its heading.
    const videos: Array<{ assetId: string; title: string }> = [];
    for (const extra of input.videos ?? []) {
      if (extra.videoId === input.video?.videoId || videos.length >= MEDIA_MAX_VIDEOS) continue;
      videos.push(await deps.saveVideo(userId, { videoId: extra.videoId, title: extra.title }));
    }
    const below = [
      ...(input.sections ?? []).map((section) => layoutSection(section, deps.newId)),
      layoutSection({ type: "media", heading: "Watch and look", videos: videos.filter((video, index) => videos.findIndex((other) => other.assetId === video.assetId) === index), images: input.pictures ?? [] }, deps.newId),
    ].filter((layout): layout is SectionLayout => layout !== null);
    const sceneJson = serializeWorkspaceScene({
      items: below.length ? stackBlocks(null, [asBlock(framed.items), ...below], deps.newId) : framed.items,
      viewport: framed.viewport,
    });
    return { workspaceId: await deps.createBoard(userId, input.draft.title, sceneJson) };
  }

  return { createMapBoard };
}
