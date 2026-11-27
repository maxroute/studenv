// ---------------------------------------------------------------------------
// Mind maps on a board: a map Rangan drafts, laid out by code
// ---------------------------------------------------------------------------
//
// Pure: no React, store or model. The model only decides what the map says
// (a centre, branches, sub-nodes, links, exam tips); every position, size,
// colour and connector is decided here, so a map is tidy and predictable.
//
// Layout: the centre in the middle, branches split right then left, each
// branch's sub-nodes in a column beyond it (chained with arrows when they are
// steps), exam tips in a row underneath, and a library source (a page, PDF,
// video, audio file or web page) as a card next to its branch. Each branch,
// its sub-nodes, card and picture sit on a coloured frame and share a group,
// so they move together. Pictures are freely licensed Commons files with a
// credit under each; Wikipedia articles used go in a "Further reading" row.

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
export type MapBranch = MapNode & {
  relation: string;
  children: MapNode[];
  source: number | null;
  /** The children are steps in order: numbered and chained with arrows. */
  steps: boolean;
  /** A Wikipedia article whose picture would illustrate this branch, or null. */
  image: string | null;
};
export type MapDraft = {
  title: string;
  centre: string;
  /** A Wikipedia article whose picture would illustrate the centre, or null. */
  image: string | null;
  /** A YouTube search for one short lesson video on the subject, or null. */
  video: string | null;
  branches: MapBranch[];
  links: Array<{ from: string; to: string; label: string }>;
  tips: string[];
};

/** A library source a branch points at, as a card on the board. */
export type MapSourceCard =
  | { kind: "note"; noteId: string; title: string; excerpt: string; blockId?: string }
  | { kind: "asset"; assetId: string; assetKind: "pdf" | "video" | "audio" | "webpage"; title: string; sourceHost?: string };

/** Pictures a map can carry: one for the centre and a few branches. */
export const MAP_MAX_IMAGES = 3;
export const MAP_MAX_READING = 4;

/** A picture on the map, keyed to the centre ("") or a branch title. */
export type MapImage = { target: string; src: string; width: number; height: number; alt: string; credit: string; sourceUrl: string };

/** A web page saved to the library, shown in "Further reading". */
export type MapReadingCard = { assetId: string; title: string; sourceHost: string };

/** A YouTube video saved to the library, shown under the centre. */
export type MapVideoCard = { assetId: string; title: string };

// ── reading the model's map ──────────────────────────────────────────────────

const words = (max: number) => z.string().transform((value) => value.replace(/\s+/g, " ").replace(/\s*\[\d{1,2}\]/g, "").trim().slice(0, max));
const rawNode = z.object({ title: words(60).pipe(z.string().min(1)), note: words(160).optional() });
const rawBranch = rawNode.extend({
  relation: words(30).optional(),
  children: z.array(z.unknown()).optional(),
  passage: z.unknown().optional(),
  steps: z.unknown().optional(),
  image: z.unknown().optional(),
});
const imageQuery = (value: unknown) => {
  const parsed = words(80).safeParse(value);
  return parsed.success && parsed.data && !/^(null|none|n\/a)$/i.test(parsed.data) ? parsed.data : null;
};

export function mapInstruction(request: string, subject: string): string {
  return [
    `The student asked: """${request.slice(0, 1_500)}"""`,
    `Plan a mind map that teaches "${subject}" at a glance, for understanding and revision.`,
    "centre: the subject in 1 to 4 words.",
    `branches: 4 to ${MAP_MAX_BRANCHES} main ideas, in learning order. Each has a title (1 to 5 words), a note (one short line, under 15 words), a relation (1 or 2 words saying how the centre relates to it, like "manages" or "uses"), and 2 to ${MAP_MAX_CHILDREN} children (each a title and a short note).`,
    "passage: for a branch, the number of the passage it is based on, or null.",
    'steps: true for a branch whose children are steps in order (a process, a sequence, a lifecycle), so they are numbered and joined by arrows; false otherwise.',
    'video: a YouTube search (3 to 6 words, in English unless the request is in another language) for one short lesson video that explains the subject, like "deadlock in operating systems explained"; null if a video would not help.',
    `image: for the centre and at most ${MAP_MAX_IMAGES - 1} branches where a picture or diagram really helps, the exact title of the English Wikipedia article whose picture shows it (like "Paging" or "Process state"); null everywhere else.`,
    `links: up to ${MAP_MAX_LINKS} links between branches or children that are worth seeing, each from and to (exact titles) and a 1 or 2 word label.`,
    `tips: up to ${MAP_MAX_TIPS} short exam tips.`,
    "Use the passages where they cover something. Write in the language of the request. Never mention passage numbers in the text.",
    'Reply with only a JSON object: {"title": "...", "centre": "...", "image": "..." or null, "video": "..." or null, "branches": [{"title": "...", "note": "...", "relation": "...", "passage": 1, "steps": false, "image": null, "children": [{"title": "...", "note": "..."}]}], "links": [{"from": "...", "to": "...", "label": "..."}], "tips": ["..."]}',
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
      steps: children.length > 1 && (branch.data.steps === true || branch.data.steps === "true"),
      image: imageQuery(branch.data.image),
    });
    if (branches.length >= MAP_MAX_BRANCHES) break;
  }
  if (branches.length < 2) return null;
  // At most MAP_MAX_IMAGES pictures, the centre's first.
  let pictures = 0;
  const centreImage = imageQuery(object.image);
  if (centreImage) pictures += 1;
  for (const branch of branches) {
    if (branch.image && pictures < MAP_MAX_IMAGES) pictures += 1;
    else branch.image = null;
  }
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
  return { title: (title.success && title.data) || `${centre.data} map`, centre: centre.data, image: centreImage, video: imageQuery(object.video), branches, links, tips };
}

/** A sticky's text: the title, then its note on the next line. */
export const stickyText = (node: MapNode) => (node.note ? `${node.title}\n${node.note}` : node.title);

/** The map as an indented outline, for a preview. */
export function mapOutline(draft: MapDraft): string[] {
  return draft.branches.flatMap((branch) => [`${branch.title}${branch.relation ? ` (${branch.relation})` : ""}`, ...branch.children.map((child) => `  ${child.title}`)]);
}

const cardKey = (card: MapSourceCard) => (card.kind === "note" ? `note:${card.noteId}` : `asset:${card.assetId}`);

/** Elements the map becomes on the board (an estimate for the preview when cards aren't resolved yet). */
export function mapElementCount(draft: MapDraft, sources: ReadonlyMap<number, MapSourceCard> = new Map(), extras: { images?: number; reading?: number; video?: boolean } = {}): number {
  const nodes = 1 + draft.branches.length + draft.branches.reduce((sum, b) => sum + b.children.length, 0);
  const cited = draft.branches.filter((b) => b.source !== null && sources.has(b.source));
  const cards = new Set(cited.map((b) => cardKey(sources.get(b.source as number) as MapSourceCard))).size;
  const images = extras.images ?? 0;
  const reading = extras.reading ?? 0;
  // Title, legend and one frame per branch; a picture brings its credit; reading brings a heading.
  // A video is a card and its connector.
  const decoration = 2 + draft.branches.length + images * 2 + (reading ? reading + 1 : 0) + (extras.video ? 2 : 0);
  return nodes + (nodes - 1) + draft.links.length + draft.tips.length + cards + cited.length + decoration;
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
const BLOCK_GAP = 80;
const FRAME_PAD = 28;
const IMAGE_MAX = { w: 320, h: 300 };
const CREDIT_H = 40;
const CREDIT_GAP = 6;

/** A pale frame and a darker dashed outline for each sticky colour. */
const FRAME_STYLE: Record<(typeof MAP_COLORS)[number], { fill: string; stroke: string }> = {
  "#CDEBDD": { fill: "#F1F9F5", stroke: "#7FBF9F" },
  "#D6E8F8": { fill: "#F2F7FD", stroke: "#86B4DE" },
  "#F6D7DE": { fill: "#FDF2F4", stroke: "#E09AAA" },
  "#F8DDC8": { fill: "#FEF5EE", stroke: "#E3A77C" },
  "#E6DDF7": { fill: "#F7F4FD", stroke: "#A994D8" },
  "#F8E7A1": { fill: "#FEF9E6", stroke: "#D9BC4F" },
};
const LINK_COLOR = "#b07b2c";
const SOURCE_COLOR = "#8a8a8a";

export const MAP_LEGEND = ["How to read this map", "→ solid arrow: a main idea", "→ numbered arrows: steps in order", "⇢ orange dashes: related ideas", "⇢ grey dashes: where it comes from"].join("\n");

type Box = { x: number; y: number; w: number; h: number };

export type MapLayoutOptions = {
  /** Library cards for branches whose `source` is in the map. */
  sources?: ReadonlyMap<number, MapSourceCard>;
  /** A page to show next to the centre (the page Rangan wrote with this map). */
  page?: { noteId: string; title: string; excerpt: string };
  /** Pictures, keyed by target: "" for the centre, a branch title (any case) otherwise. */
  images?: ReadonlyArray<MapImage>;
  /** Web pages for the "Further reading" row. */
  reading?: ReadonlyArray<MapReadingCard>;
  /** A lesson video, as a card under the centre. */
  video?: MapVideoCard;
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
    color: options.color ?? SOURCE_COLOR,
    strokeWidth: 2,
    strokeStyle: options.dashed ? "dash" : "solid",
    frontEndpointStyle: "none",
    rearEndpointStyle: options.arrow ? "arrow" : "none",
    ...(options.label ? { label: { text: options.label, offset: 0.5 } } : {}),
  },
});

/** A picture's size on the board: its shape kept, within IMAGE_MAX. */
export function mapImageSize(image: Pick<MapImage, "width" | "height">): { w: number; h: number } {
  const scale = Math.min(IMAGE_MAX.w / image.width, IMAGE_MAX.h / image.height);
  return { w: Math.max(60, Math.round(image.width * scale)), h: Math.max(40, Math.round(image.height * scale)) };
}

const bounds = (boxes: Box[]): Box => {
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

/**
 * The map as board elements: framed branches of stickies, connectors, cards,
 * pictures with credits, a heading and a legend. Every element is valid for
 * the board's scene schema.
 */
export function layoutMap(draft: MapDraft, options: MapLayoutOptions): StudioItem[] {
  const origin = options.origin ?? { x: 0, y: 0 };
  let z = options.zIndexBase ?? 1;
  const frames: StudioItem[] = [];
  const connectors: StudioItem[] = [];
  const nodes: StudioItem[] = [];
  const idsByTitle = new Map<string, string>();
  /** One card per page or file, however many branches use it. */
  const cardIds = new Map<string, string>();
  const imageFor = new Map((options.images ?? []).map((image) => [image.target.toLowerCase(), image]));

  const sticky = (box: Box, text: string, color: string, groupId?: string): string => {
    const id = options.newId();
    nodes.push({ id, type: "sticky", x: Math.round(box.x), y: Math.round(box.y), w: box.w, h: box.h, rotation: 0, zIndex: 0, props: { text, color, ...(groupId ? { groupId } : {}) } });
    return id;
  };
  const text = (box: Box, value: string, fontSize: number, color: string, groupId?: string): string => {
    const id = options.newId();
    nodes.push({ id, type: "free-text", x: Math.round(box.x), y: Math.round(box.y), w: box.w, h: box.h, rotation: 0, zIndex: 0, props: { text: value, color, fontSize, ...(groupId ? { groupId } : {}) } });
    return id;
  };
  /** A picture with its credit underneath; returns the boxes both take. */
  const picture = (image: MapImage, at: { x: number; y: number }, groupId?: string): Box[] => {
    const size = mapImageSize(image);
    const box = { x: at.x, y: at.y, ...size };
    nodes.push({ id: options.newId(), type: "image", x: Math.round(box.x), y: Math.round(box.y), ...size, rotation: 0, zIndex: 0, props: { src: image.src, alt: image.alt, ...(groupId ? { groupId } : {}) } });
    const credit = { x: box.x, y: box.y + box.h + CREDIT_GAP, w: Math.max(size.w, 200), h: CREDIT_H };
    text(credit, `Picture: ${image.alt}\n${image.credit}, Wikimedia Commons`, 12, "#6b6b6b", groupId);
    return [box, credit];
  };
  const pictureHeight = (image: MapImage) => mapImageSize(image).h + CREDIT_GAP + CREDIT_H;

  const centreBox = { x: origin.x - SIZE.centre.w / 2, y: origin.y - SIZE.centre.h / 2, ...SIZE.centre };
  const centreId = sticky(centreBox, draft.centre, CENTRE_COLOR);

  const right = draft.branches.slice(0, Math.ceil(draft.branches.length / 2));
  const left = draft.branches.slice(right.length);
  let lowest = centreBox.y + centreBox.h;
  let leftmost = centreBox.x;
  let topmost = centreBox.y;

  const side = (branches: MapBranch[], direction: 1 | -1, colorOffset: number) => {
    const blockHeight = (branch: MapBranch) => {
      const column = Math.max(SIZE.branch.h, branch.children.length * (SIZE.child.h + ROW_GAP) - ROW_GAP);
      const image = imageFor.get(branch.title.toLowerCase());
      return image ? Math.max(column, pictureHeight(image)) : column;
    };
    const total = branches.reduce((sum, branch) => sum + blockHeight(branch), 0) + BLOCK_GAP * Math.max(0, branches.length - 1);
    let top = origin.y - total / 2;
    branches.forEach((branch, index) => {
      const color = MAP_COLORS[(index * 2 + colorOffset) % MAP_COLORS.length];
      const groupId = `rangan-${options.newId()}`;
      const height = blockHeight(branch);
      const blockBoxes: Box[] = [];
      const branchX = direction === 1 ? centreBox.x + centreBox.w + BRANCH_GAP_X : centreBox.x - BRANCH_GAP_X - SIZE.branch.w;
      const branchBox = { x: branchX, y: top + (height - SIZE.branch.h) / 2, ...SIZE.branch };
      const branchId = sticky(branchBox, stickyText(branch), color, groupId);
      blockBoxes.push(branchBox);
      idsByTitle.set(branch.title.toLowerCase(), branchId);
      connectors.push(connector(options.newId(), centreId, branchId, 0, { label: branch.relation, arrow: true }));

      const childX = direction === 1 ? branchBox.x + branchBox.w + CHILD_GAP_X : branchBox.x - CHILD_GAP_X - SIZE.child.w;
      const columnHeight = Math.max(0, branch.children.length * (SIZE.child.h + ROW_GAP) - ROW_GAP);
      const columnTop = top + (height - columnHeight) / 2;
      let previous = branchId;
      branch.children.forEach((child, childIndex) => {
        const childBox = { x: childX, y: columnTop + childIndex * (SIZE.child.h + ROW_GAP), ...SIZE.child };
        const label = branch.steps ? { ...child, title: `${childIndex + 1}. ${child.title}` } : child;
        const childId = sticky(childBox, stickyText(label), color, groupId);
        blockBoxes.push(childBox);
        idsByTitle.set(child.title.toLowerCase(), childId);
        // Steps run one after another; other children fan out from the branch.
        connectors.push(connector(options.newId(), branch.steps ? previous : branchId, childId, 0, branch.steps ? { arrow: true } : {}));
        previous = childId;
      });

      // Beyond the column: the branch's library card, then its picture.
      const columnX = branch.children.length ? childX : branchBox.x;
      const columnW = branch.children.length ? SIZE.child.w : SIZE.branch.w;
      let extraTop = top;
      const beyond = (w: number) => (direction === 1 ? columnX + columnW + CARD_GAP_X : columnX - CARD_GAP_X - w);

      const card = branch.source !== null ? options.sources?.get(branch.source) : undefined;
      const existingCard = card ? cardIds.get(cardKey(card)) : undefined;
      if (card && existingCard) {
        connectors.push(connector(options.newId(), branchId, existingCard, 0, { label: "source", dashed: true }));
      } else if (card) {
        const size = card.kind === "note" ? SIZE.noteCard : SIZE.resourceCard;
        const cardId = options.newId();
        const cardBox = { x: Math.round(beyond(size.w)), y: Math.round(extraTop), ...size };
        nodes.push(
          card.kind === "note"
            ? { id: cardId, type: "note-card", ...cardBox, rotation: 0, zIndex: 0, props: { noteId: card.noteId, title: card.title, excerpt: card.excerpt.slice(0, 280), groupId, ...(card.blockId ? { blockId: card.blockId } : {}) } }
            : { id: cardId, type: "resource-card", ...cardBox, rotation: 0, zIndex: 0, props: { assetId: card.assetId, kind: card.assetKind, title: card.title, groupId, ...(card.sourceHost ? { sourceHost: card.sourceHost } : {}) } },
        );
        blockBoxes.push(cardBox);
        cardIds.set(cardKey(card), cardId);
        connectors.push(connector(options.newId(), branchId, cardId, 0, { label: "source", dashed: true }));
        extraTop += size.h + ROW_GAP;
      }
      const image = imageFor.get(branch.title.toLowerCase());
      if (image) blockBoxes.push(...picture(image, { x: beyond(mapImageSize(image).w), y: extraTop }, groupId));

      // The frame behind the whole branch, in the branch's colour.
      const frame = bounds(blockBoxes);
      const style = FRAME_STYLE[color];
      frames.push({
        id: options.newId(),
        type: "shape",
        x: Math.round(frame.x - FRAME_PAD),
        y: Math.round(frame.y - FRAME_PAD),
        w: Math.round(frame.w + FRAME_PAD * 2),
        h: Math.round(frame.h + FRAME_PAD * 2),
        rotation: 0,
        zIndex: 0,
        props: { kind: "rounded-rectangle", fill: { type: "solid", color: style.fill }, stroke: { width: 2, color: style.stroke, style: "dashed" }, cornerRadius: 24, opacity: 100, shadow: false, locked: false, groupId, text: "" },
      });
      lowest = Math.max(lowest, frame.y + frame.h + FRAME_PAD);
      leftmost = Math.min(leftmost, frame.x - FRAME_PAD);
      topmost = Math.min(topmost, frame.y - FRAME_PAD);
      top += height + BLOCK_GAP;
    });
  };
  side(right, 1, 0);
  side(left, -1, 1);

  for (const link of draft.links) {
    const from = idsByTitle.get(link.from.toLowerCase());
    const to = idsByTitle.get(link.to.toLowerCase());
    if (from && to) connectors.push(connector(options.newId(), from, to, 0, { label: link.label, dashed: true, arrow: true, color: LINK_COLOR }));
  }

  // Under the centre: its picture, then the page written with the map.
  let underCentre = centreBox.y + centreBox.h + 90;
  const centreImage = imageFor.get("");
  if (centreImage) {
    const size = mapImageSize(centreImage);
    const boxes = picture(centreImage, { x: origin.x - size.w / 2, y: underCentre });
    underCentre = bounds(boxes).y + bounds(boxes).h + 60;
  }
  if (options.video) {
    const box = { x: origin.x - SIZE.resourceCard.w / 2, y: underCentre, ...SIZE.resourceCard };
    const cardId = options.newId();
    nodes.push({ id: cardId, type: "resource-card", ...box, rotation: 0, zIndex: 0, props: { assetId: options.video.assetId, kind: "video", title: options.video.title.slice(0, 300), sourceHost: "www.youtube.com" } });
    connectors.push(connector(options.newId(), centreId, cardId, 0, { label: "watch", dashed: true }));
    underCentre = box.y + box.h + 60;
  }
  if (options.page) {
    const box = { x: origin.x - SIZE.noteCard.w / 2, y: underCentre, ...SIZE.noteCard };
    const cardId = options.newId();
    nodes.push({ id: cardId, type: "note-card", ...box, rotation: 0, zIndex: 0, props: { noteId: options.page.noteId, title: options.page.title, excerpt: options.page.excerpt.slice(0, 280) } });
    connectors.push(connector(options.newId(), centreId, cardId, 0, { label: "full notes", dashed: true }));
    underCentre = box.y + box.h + 60;
  }
  lowest = Math.max(lowest, underCentre - 60);

  let row = lowest + 110;
  const tipsWidth = draft.tips.length * SIZE.tip.w + Math.max(0, draft.tips.length - 1) * ROW_GAP;
  draft.tips.forEach((tip, index) => {
    sticky({ x: origin.x - tipsWidth / 2 + index * (SIZE.tip.w + ROW_GAP), y: row, ...SIZE.tip }, `Exam tip\n${tip}`, TIP_COLOR);
  });
  if (draft.tips.length) row += SIZE.tip.h + 80;

  const reading = options.reading ?? [];
  if (reading.length) {
    const width = reading.length * SIZE.resourceCard.w + Math.max(0, reading.length - 1) * ROW_GAP;
    const groupId = `rangan-${options.newId()}`;
    text({ x: origin.x - width / 2, y: row, w: Math.max(width, 300), h: 40 }, "Further reading", 22, "#1e1e1e", groupId);
    reading.forEach((page, index) => {
      nodes.push({
        id: options.newId(),
        type: "resource-card",
        x: Math.round(origin.x - width / 2 + index * (SIZE.resourceCard.w + ROW_GAP)),
        y: Math.round(row + 52),
        ...SIZE.resourceCard,
        rotation: 0,
        zIndex: 0,
        props: { assetId: page.assetId, kind: "webpage", title: page.title, sourceHost: page.sourceHost, groupId },
      });
    });
  }

  // Above the map: the title in the middle, the legend at the left.
  const titleBox = { x: origin.x - 300, y: topmost - 110, w: 600, h: 64 };
  text(titleBox, draft.title, 32, "#1e1e1e");
  // A narrow map has no room beside the title, so the legend goes above it.
  const beside = leftmost + 300 + 40 <= titleBox.x;
  text({ x: leftmost, y: beside ? topmost - 150 : titleBox.y - 150, w: 300, h: 120 }, MAP_LEGEND, 15, "#555555");

  // Frames at the back, connectors over them, then the cards and notes.
  return [...frames, ...connectors, ...nodes].map((item) => ({ ...item, zIndex: z++ }) as StudioItem);
}

/** A map draft as the browser sends it back to be created; caps match what the parser keeps. */
const draftNode = z.object({ title: z.string().trim().min(1).max(60), note: z.string().max(160) }).strict();
export const mapDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    centre: z.string().trim().min(1).max(60),
    image: z.string().max(80).nullable().default(null),
    video: z.string().max(80).nullable().default(null),
    branches: z
      .array(
        draftNode
          .extend({
            relation: z.string().max(30),
            source: z.number().int().positive().nullable(),
            steps: z.boolean().default(false),
            image: z.string().max(80).nullable().default(null),
            children: z.array(draftNode).max(MAP_MAX_CHILDREN),
          })
          .strict(),
      )
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
