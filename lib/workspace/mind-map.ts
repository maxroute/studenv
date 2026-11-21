// ---------------------------------------------------------------------------
// Mind maps on a board: a map Rangan drafts, laid out by code
// ---------------------------------------------------------------------------
//
// Pure: no React, store or model. The model only decides what the map says
// (a centre, branches, sub-nodes, links, exam tips); every position, size,
// colour and connector is decided here, so a map is tidy and predictable.
//
// Layout: the centre in the middle, branches split right then left, each
// branch's sub-nodes in a column beyond it, exam tips in a row underneath,
// and a library source (a page or a PDF/video) as a card next to its branch.
// Each branch and its sub-nodes share a group, so they move together.

import { z } from "zod";
import type { ConnectorNode, StudioItem } from "@/types/workspace";

export const MAP_MAX_BRANCHES = 8;
export const MAP_MAX_CHILDREN = 5;
export const MAP_MAX_LINKS = 6;
export const MAP_MAX_TIPS = 4;

/** Sticky colours, as the sticky colour menu offers them. */
export const MAP_COLORS = ["#CDEBDD", "#D6E8F8", "#F6D7DE", "#F8DDC8", "#E6DDF7", "#F8E7A1"] as const;
const CENTRE_COLOR = "#F8E7A1";
const TIP_COLOR = "#F8E7A1";

export type MapNode = { title: string; note: string };
export type MapBranch = MapNode & { relation: string; children: MapNode[]; source: number | null };
export type MapDraft = {
  title: string;
  centre: string;
  branches: MapBranch[];
  links: Array<{ from: string; to: string; label: string }>;
  tips: string[];
};

/** A library source a branch points at, as a card on the board. */
export type MapSourceCard =
  | { kind: "note"; noteId: string; title: string; excerpt: string; blockId?: string }
  | { kind: "asset"; assetId: string; assetKind: "pdf" | "video"; title: string };

// ── reading the model's map ──────────────────────────────────────────────────

const words = (max: number) => z.string().transform((value) => value.replace(/\s+/g, " ").replace(/\s*\[\d{1,2}\]/g, "").trim().slice(0, max));
const rawNode = z.object({ title: words(60).pipe(z.string().min(1)), note: words(160).optional() });
const rawBranch = rawNode.extend({ relation: words(30).optional(), children: z.array(z.unknown()).optional(), passage: z.unknown().optional() });

export function mapInstruction(request: string, subject: string): string {
  return [
    `The student asked: """${request.slice(0, 1_500)}"""`,
    `Plan a mind map that teaches "${subject}" at a glance, for understanding and revision.`,
    "centre: the subject in 1 to 4 words.",
    `branches: 4 to ${MAP_MAX_BRANCHES} main ideas, in learning order. Each has a title (1 to 5 words), a note (one short line, under 15 words), a relation (1 or 2 words saying how the centre relates to it, like "manages" or "uses"), and 2 to ${MAP_MAX_CHILDREN} children (each a title and a short note).`,
    "passage: for a branch, the number of the passage it is based on, or null.",
    `links: up to ${MAP_MAX_LINKS} links between branches or children that are worth seeing, each from and to (exact titles) and a 1 or 2 word label.`,
    `tips: up to ${MAP_MAX_TIPS} short exam tips.`,
    "Use the passages where they cover something. Write in the language of the request. Never mention passage numbers in the text.",
    'Reply with only a JSON object: {"title": "...", "centre": "...", "branches": [{"title": "...", "note": "...", "relation": "...", "passage": 1, "children": [{"title": "...", "note": "..."}]}], "links": [{"from": "...", "to": "...", "label": "..."}], "tips": ["..."]}',
  ].join("\n");
}

/** The model's map, kept only if it has a centre and at least two branches; null otherwise. */
export function parseMapReply(object: Record<string, unknown> | null, passageCount: number): MapDraft | null {
  if (!object) return null;
  const centre = words(60).safeParse(object.centre);
  if (!centre.success || !centre.data) return null;
  const seen = new Set<string>([centre.data.toLowerCase()]);
  const fresh = (title: string) => {
    const key = title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  const branches: MapBranch[] = [];
  for (const entry of Array.isArray(object.branches) ? object.branches : []) {
    const branch = rawBranch.safeParse(entry);
    if (!branch.success || !fresh(branch.data.title)) continue;
    const children: MapNode[] = [];
    for (const child of branch.data.children ?? []) {
      const parsed = rawNode.safeParse(child);
      if (parsed.success && fresh(parsed.data.title)) children.push({ title: parsed.data.title, note: parsed.data.note ?? "" });
      if (children.length >= MAP_MAX_CHILDREN) break;
    }
    const n = typeof branch.data.passage === "number" ? branch.data.passage : Number(branch.data.passage);
    branches.push({
      title: branch.data.title,
      note: branch.data.note ?? "",
      relation: branch.data.relation ?? "",
      children,
      source: Number.isInteger(n) && n >= 1 && n <= passageCount ? n : null,
    });
    if (branches.length >= MAP_MAX_BRANCHES) break;
  }
  if (branches.length < 2) return null;
  const titles = new Set([...branches.map((b) => b.title), ...branches.flatMap((b) => b.children.map((c) => c.title))].map((t) => t.toLowerCase()));
  const links = (Array.isArray(object.links) ? object.links : [])
    .flatMap((entry) => {
      const link = z.object({ from: words(60), to: words(60), label: words(30).optional() }).safeParse(entry);
      return link.success && link.data.from.toLowerCase() !== link.data.to.toLowerCase() && titles.has(link.data.from.toLowerCase()) && titles.has(link.data.to.toLowerCase())
        ? [{ from: link.data.from, to: link.data.to, label: link.data.label ?? "" }]
        : [];
    })
    .slice(0, MAP_MAX_LINKS);
  const tips = (Array.isArray(object.tips) ? object.tips : [])
    .flatMap((tip) => (typeof tip === "string" && tip.trim() ? [tip.replace(/\s+/g, " ").replace(/\s*\[\d{1,2}\]/g, "").trim().slice(0, 200)] : []))
    .slice(0, MAP_MAX_TIPS);
  const title = words(120).safeParse(object.title);
  return { title: (title.success && title.data) || `${centre.data} map`, centre: centre.data, branches, links, tips };
}

/** A sticky's text: the title, then its note on the next line. */
export const stickyText = (node: MapNode) => (node.note ? `${node.title}\n${node.note}` : node.title);

/** The map as an indented outline, for a preview. */
export function mapOutline(draft: MapDraft): string[] {
  return draft.branches.flatMap((branch) => [`${branch.title}${branch.relation ? ` (${branch.relation})` : ""}`, ...branch.children.map((child) => `  ${child.title}`)]);
}

/** Elements the map becomes on the board. */
export function mapElementCount(draft: MapDraft, sources: ReadonlyMap<number, MapSourceCard> = new Map()): number {
  const nodes = 1 + draft.branches.length + draft.branches.reduce((sum, b) => sum + b.children.length, 0);
  const cited = draft.branches.filter((b) => b.source !== null && sources.has(b.source));
  const cards = new Set(cited.map((b) => {
    const card = sources.get(b.source as number) as MapSourceCard;
    return card.kind === "note" ? `note:${card.noteId}` : `asset:${card.assetId}`;
  })).size;
  return nodes + (nodes - 1) + draft.links.length + draft.tips.length + cards + cited.length + 1;
}

// ── layout ───────────────────────────────────────────────────────────────────

const SIZE = {
  centre: { w: 280, h: 160 },
  branch: { w: 230, h: 130 },
  child: { w: 210, h: 110 },
  tip: { w: 230, h: 140 },
  noteCard: { w: 280, h: 160 },
  resourceCard: { w: 280, h: 88 },
} as const;
const BRANCH_GAP_X = 170;
const CHILD_GAP_X = 130;
const CARD_GAP_X = 110;
const ROW_GAP = 24;
const BLOCK_GAP = 56;

type Box = { x: number; y: number; w: number; h: number };

export type MapLayoutOptions = {
  /** Library cards for branches whose `source` is in the map. */
  sources?: ReadonlyMap<number, MapSourceCard>;
  /** A page to show next to the centre (the page Rangan wrote with this map). */
  page?: { noteId: string; title: string; excerpt: string };
  newId: () => string;
  /** Where the map's centre goes. */
  origin?: { x: number; y: number };
  /** zIndex to start from, above what is already on the board. */
  zIndexBase?: number;
};

const connector = (
  id: string,
  from: string,
  to: string,
  zIndex: number,
  options: { label?: string; dashed?: boolean; arrow?: boolean; color?: string } = {},
): ConnectorNode => ({
  id,
  type: "connector",
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  rotation: 0,
  zIndex,
  props: {
    source: { id: from },
    target: { id: to },
    mode: "curve",
    color: options.color ?? "#8a8a8a",
    strokeWidth: 2,
    strokeStyle: options.dashed ? "dash" : "solid",
    frontEndpointStyle: "none",
    rearEndpointStyle: options.arrow ? "arrow" : "none",
    ...(options.label ? { label: { text: options.label, offset: 0.5 } } : {}),
  },
});

/**
 * The map as board elements: stickies, connectors, cards and a heading.
 * Every element is valid for the board's scene schema.
 */
export function layoutMap(draft: MapDraft, options: MapLayoutOptions): StudioItem[] {
  const origin = options.origin ?? { x: 0, y: 0 };
  let z = options.zIndexBase ?? 1;
  const connectors: StudioItem[] = [];
  const nodes: StudioItem[] = [];
  const idsByTitle = new Map<string, string>();
  /** One card per page or file, however many branches use it. */
  const cardIds = new Map<string, string>();

  const sticky = (box: Box, text: string, color: string, groupId?: string): string => {
    const id = options.newId();
    nodes.push({ id, type: "sticky", x: Math.round(box.x), y: Math.round(box.y), w: box.w, h: box.h, rotation: 0, zIndex: 0, props: { text, color, ...(groupId ? { groupId } : {}) } });
    return id;
  };

  const centreBox = { x: origin.x - SIZE.centre.w / 2, y: origin.y - SIZE.centre.h / 2, ...SIZE.centre };
  const centreId = sticky(centreBox, draft.centre, CENTRE_COLOR);
  nodes.push({
    id: options.newId(),
    type: "free-text",
    x: Math.round(origin.x - 300),
    y: Math.round(centreBox.y - 120),
    w: 600,
    h: 64,
    rotation: 0,
    zIndex: 0,
    props: { text: draft.title, color: "#1e1e1e", fontSize: 32 },
  });

  const right = draft.branches.slice(0, Math.ceil(draft.branches.length / 2));
  const left = draft.branches.slice(right.length);
  let lowest = centreBox.y + centreBox.h;

  const side = (branches: MapBranch[], direction: 1 | -1, colorOffset: number) => {
    const blockHeight = (branch: MapBranch) => Math.max(SIZE.branch.h, branch.children.length * (SIZE.child.h + ROW_GAP) - ROW_GAP);
    const total = branches.reduce((sum, branch) => sum + blockHeight(branch), 0) + BLOCK_GAP * Math.max(0, branches.length - 1);
    let top = origin.y - total / 2;
    branches.forEach((branch, index) => {
      const color = MAP_COLORS[(index * 2 + colorOffset) % MAP_COLORS.length];
      const groupId = `rangan-${options.newId()}`;
      const height = blockHeight(branch);
      const branchX = direction === 1 ? centreBox.x + centreBox.w + BRANCH_GAP_X : centreBox.x - BRANCH_GAP_X - SIZE.branch.w;
      const branchBox = { x: branchX, y: top + (height - SIZE.branch.h) / 2, ...SIZE.branch };
      const branchId = sticky(branchBox, stickyText(branch), color, groupId);
      idsByTitle.set(branch.title.toLowerCase(), branchId);
      connectors.push(connector(options.newId(), centreId, branchId, 0, { label: branch.relation, arrow: true }));

      const childX = direction === 1 ? branchBox.x + branchBox.w + CHILD_GAP_X : branchBox.x - CHILD_GAP_X - SIZE.child.w;
      branch.children.forEach((child, childIndex) => {
        const childBox = { x: childX, y: top + childIndex * (SIZE.child.h + ROW_GAP), ...SIZE.child };
        const childId = sticky(childBox, stickyText(child), color, groupId);
        idsByTitle.set(child.title.toLowerCase(), childId);
        connectors.push(connector(options.newId(), branchId, childId, 0));
      });

      const card = branch.source !== null ? options.sources?.get(branch.source) : undefined;
      const cardKey = card ? (card.kind === "note" ? `note:${card.noteId}` : `asset:${card.assetId}`) : "";
      const existingCard = cardIds.get(cardKey);
      if (card && existingCard) {
        connectors.push(connector(options.newId(), branchId, existingCard, 0, { label: "source", dashed: true }));
      } else if (card) {
        const size = card.kind === "note" ? SIZE.noteCard : SIZE.resourceCard;
        const columnX = branch.children.length ? childX : branchBox.x;
        const width = branch.children.length ? SIZE.child.w : SIZE.branch.w;
        const cardX = direction === 1 ? columnX + width + CARD_GAP_X : columnX - CARD_GAP_X - size.w;
        const cardId = options.newId();
        const cardY = Math.round(branchBox.y + (branchBox.h - size.h) / 2);
        nodes.push(
          card.kind === "note"
            ? { id: cardId, type: "note-card", x: Math.round(cardX), y: cardY, ...size, rotation: 0, zIndex: 0, props: { noteId: card.noteId, title: card.title, excerpt: card.excerpt.slice(0, 280), groupId, ...(card.blockId ? { blockId: card.blockId } : {}) } }
            : { id: cardId, type: "resource-card", x: Math.round(cardX), y: cardY, ...size, rotation: 0, zIndex: 0, props: { assetId: card.assetId, kind: card.assetKind, title: card.title, groupId } },
        );
        cardIds.set(cardKey, cardId);
        connectors.push(connector(options.newId(), branchId, cardId, 0, { label: "source", dashed: true }));
      }
      lowest = Math.max(lowest, top + height);
      top += height + BLOCK_GAP;
    });
  };
  side(right, 1, 0);
  side(left, -1, 1);

  for (const link of draft.links) {
    const from = idsByTitle.get(link.from.toLowerCase());
    const to = idsByTitle.get(link.to.toLowerCase());
    if (from && to) connectors.push(connector(options.newId(), from, to, 0, { label: link.label, dashed: true, arrow: true, color: "#b07b2c" }));
  }

  if (options.page) {
    const box = { x: origin.x - SIZE.noteCard.w / 2, y: centreBox.y + centreBox.h + 90, ...SIZE.noteCard };
    const cardId = options.newId();
    nodes.push({ id: cardId, type: "note-card", ...box, rotation: 0, zIndex: 0, props: { noteId: options.page.noteId, title: options.page.title, excerpt: options.page.excerpt.slice(0, 280) } });
    connectors.push(connector(options.newId(), centreId, cardId, 0, { label: "full notes", dashed: true }));
    lowest = Math.max(lowest, box.y + box.h);
  }

  const tipsWidth = draft.tips.length * SIZE.tip.w + Math.max(0, draft.tips.length - 1) * ROW_GAP;
  draft.tips.forEach((tip, index) => {
    sticky({ x: origin.x - tipsWidth / 2 + index * (SIZE.tip.w + ROW_GAP), y: lowest + 110, ...SIZE.tip }, `Exam tip\n${tip}`, TIP_COLOR);
  });

  // Connectors under the stickies they join.
  return [...connectors, ...nodes].map((item) => ({ ...item, zIndex: z++ }) as StudioItem);
}

/** A map draft as the browser sends it back to be created; caps match what the parser keeps. */
const draftNode = z.object({ title: z.string().trim().min(1).max(60), note: z.string().max(160) }).strict();
export const mapDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    centre: z.string().trim().min(1).max(60),
    branches: z
      .array(draftNode.extend({ relation: z.string().max(30), source: z.number().int().positive().nullable(), children: z.array(draftNode).max(MAP_MAX_CHILDREN) }).strict())
      .min(2)
      .max(MAP_MAX_BRANCHES),
    links: z.array(z.object({ from: z.string().max(60), to: z.string().max(60), label: z.string().max(30) }).strict()).max(MAP_MAX_LINKS),
    tips: z.array(z.string().max(200)).max(MAP_MAX_TIPS),
  })
  .strict();

/** The items moved so the map's top-left corner is at (0, 0), with a camera that shows it whole. */
export function framedMap(items: StudioItem[]): { items: StudioItem[]; viewport: { x: number; y: number; zoom: number } } {
  const solid = items.filter((item) => item.type !== "connector");
  const minX = Math.min(...solid.map((item) => item.x));
  const minY = Math.min(...solid.map((item) => item.y));
  const moved = items.map((item) => (item.type === "connector" ? item : ({ ...item, x: item.x - minX, y: item.y - minY } as StudioItem)));
  return { items: moved, viewport: { x: 40, y: 40, zoom: 0.5 } };
}
