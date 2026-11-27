// ---------------------------------------------------------------------------
// Board sections: diagrams a board is made of, laid out by code
// ---------------------------------------------------------------------------
//
// Pure: no React, store or model. A section's draft only says what it shows
// (steps, parts, rows, milestones, media); every position, size, colour and
// connector is decided here. Labels are written inside shapes. Nothing is
// grouped, because a shape is typed into when it is the only one selected.
//
// Sections: a flowchart, a labelled diagram (a whole split into named parts),
// a comparison table, a timeline or roadmap, and a media row. composeBoard
// stacks sections into one board.

import { z } from "zod";
import type { ConnectorNode, ShapeNode, StudioItem } from "@/types/workspace";
import { buildShapeProps } from "./shape-engine";
import type { ShapeKind } from "./shape-types";
import { mapImageSize, type MapImage } from "./mind-map";
import { computeConnectorRoute } from "./connector-routing";

export const SECTION_LIMITS = {
  flowNodes: 14,
  flowEdges: 20,
  parts: 6,
  columns: 4,
  rows: 8,
  milestones: 8,
  videos: 4,
  images: 4,
  sections: 6,
} as const;

// ── drafts ───────────────────────────────────────────────────────────────────

const line = (max: number) => z.string().trim().min(1).max(max);
const optionalLine = (max: number) => z.string().trim().max(max).default("");
const heading = line(80);

const flowchartSchema = z
  .object({
    type: z.literal("flowchart"),
    heading,
    nodes: z
      .array(z.object({ id: line(20), kind: z.enum(["start", "step", "decision", "end"]), text: line(90) }).strict())
      .min(2)
      .max(SECTION_LIMITS.flowNodes),
    edges: z.array(z.object({ from: line(20), to: line(20), label: optionalLine(16) }).strict()).min(1).max(SECTION_LIMITS.flowEdges),
  })
  .strict();

const diagramSchema = z
  .object({
    type: z.literal("diagram"),
    heading,
    parts: z.array(z.object({ name: line(30), detail: line(160) }).strict()).min(2).max(SECTION_LIMITS.parts),
    /** What goes between neighbouring parts, like "." in a token or "→" in a pipeline. */
    joiner: optionalLine(3),
  })
  .strict();

const comparisonSchema = z
  .object({
    type: z.literal("comparison"),
    heading,
    columns: z.array(line(40)).min(2).max(SECTION_LIMITS.columns),
    rows: z.array(z.object({ label: line(40), cells: z.array(optionalLine(120)).max(SECTION_LIMITS.columns) }).strict()).min(1).max(SECTION_LIMITS.rows),
  })
  .strict();

const timelineSchema = z
  .object({
    type: z.literal("timeline"),
    heading,
    milestones: z.array(z.object({ when: optionalLine(24), title: line(50), detail: optionalLine(120) }).strict()).min(2).max(SECTION_LIMITS.milestones),
  })
  .strict();

export const sectionDraftSchema = z.discriminatedUnion("type", [flowchartSchema, diagramSchema, comparisonSchema, timelineSchema]);
export type SectionDraft = z.infer<typeof sectionDraftSchema>;

/** The media row is made of things already found and saved, so it isn't part of a model's draft. */
export type MediaSection = {
  type: "media";
  heading: string;
  videos: ReadonlyArray<{ assetId: string; title: string; sourceHost?: string }>;
  images: ReadonlyArray<Omit<MapImage, "target">>;
};

export type BoardSection = SectionDraft | MediaSection;

export type SectionLayout = {
  /** Items with the section's top-left corner at (0, 0). */
  items: StudioItem[];
  width: number;
  height: number;
};

type Box = { x: number; y: number; w: number; h: number };

// ── building blocks ──────────────────────────────────────────────────────────

const PALETTE = {
  blue: { fill: "#D6E8F8", stroke: "#2f6fd1" },
  green: { fill: "#CDEBDD", stroke: "#2e8b57" },
  yellow: { fill: "#F8E7A1", stroke: "#b8941f" },
  pink: { fill: "#F6D7DE", stroke: "#c25a74" },
  orange: { fill: "#F8DDC8", stroke: "#c9772f" },
  purple: { fill: "#E6DDF7", stroke: "#7b5cd6" },
  plain: { fill: "#FFFFFF", stroke: "#9aa3ad" },
} as const;
type Tone = keyof typeof PALETTE;
const CYCLE: Tone[] = ["blue", "green", "orange", "purple", "pink", "yellow"];
const LINE_COLOR = "#6b7280";
const INK = "#1e1e1e";

/** Lines a text wraps to in a box about `width` px wide at the board's reading size (16px). */
export function wrappedLines(text: string, width: number): number {
  const perLine = Math.max(1, Math.floor(width / 9));
  return text.split("\n").reduce((total, part) => {
    let lines = 1;
    let used = 0;
    for (const word of part.split(/\s+/)) {
      const need = used ? word.length + 1 : word.length;
      if (used + need <= perLine) used += need;
      else {
        // A word longer than a line breaks across several.
        lines += (used ? 1 : 0) + Math.floor(Math.max(0, word.length - 1) / perLine);
        used = word.length % perLine || perLine;
      }
    }
    return total + lines;
  }, 0);
}

const LINE_H = 21;

/** Whether a horizontal or vertical stretch of line passes through the inside of a box. */
function segmentEnters(a: { x: number; y: number }, b: { x: number; y: number }, box: Box): boolean {
  return Math.max(a.x, b.x) > box.x + 1 && Math.min(a.x, b.x) < box.x + box.w - 1 && Math.max(a.y, b.y) > box.y + 1 && Math.min(a.y, b.y) < box.y + box.h - 1;
}

function builder(newId: () => string) {
  const lines: StudioItem[] = [];
  const front: StudioItem[] = [];

  const shape = (kind: ShapeKind, box: Box, text: string, tone: Tone, options: { radius?: number } = {}): string => {
    const id = newId();
    const colors = PALETTE[tone];
    const props = buildShapeProps(
      kind,
      {
        fill: { type: "solid", color: colors.fill },
        stroke: { width: 2, color: colors.stroke, style: "solid" },
        cornerRadius: options.radius ?? 12,
        opacity: 100,
        shadow: false,
      },
    );
    const node: ShapeNode = {
      id,
      type: "shape",
      x: Math.round(box.x),
      y: Math.round(box.y),
      w: Math.round(box.w),
      h: Math.round(box.h),
      rotation: 0,
      zIndex: 0,
      props: { ...props, text },
    };
    front.push(node);
    return id;
  };

  const text = (box: Box, value: string, fontSize: number, color: string = INK): string => {
    const id = newId();
    front.push({ id, type: "free-text", x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h), rotation: 0, zIndex: 0, props: { text: value, color, fontSize } });
    return id;
  };

  type End = { id: string; side?: "top" | "right" | "bottom" | "left" };
  const SIDE_AT = { top: [0.5, 0], right: [1, 0.5], bottom: [0.5, 1], left: [0, 0.5] } as const;
  const end = (value: End) => (value.side ? { id: value.id, position: [...SIDE_AT[value.side]] as [number, number] } : { id: value.id });
  const connect = (from: End, to: End, options: { label?: string; labelAt?: number; arrow?: boolean; mode?: "straight" | "elbow"; dashed?: boolean } = {}): string => {
    const id = newId();
    const node: ConnectorNode = {
      id,
      type: "connector",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      rotation: 0,
      zIndex: 0,
      props: {
        source: end(from),
        target: end(to),
        mode: options.mode ?? "straight",
        color: LINE_COLOR,
        strokeWidth: 2,
        strokeStyle: options.dashed ? "dash" : "solid",
        frontEndpointStyle: "none",
        rearEndpointStyle: options.arrow === false ? "none" : "arrow",
        ...(options.label ? { label: { text: options.label, offset: options.labelAt ?? 0.5 } } : {}),
      },
    };
    lines.push(node);
    return id;
  };

  /** Whether the last connector, as the board will route it, stays out of every element it doesn't join. */
  const lastLineIsClear = (): boolean => {
    const node = lines[lines.length - 1] as ConnectorNode;
    const route = computeConnectorRoute(node.props, front);
    if (!route) return false;
    return !front.some(
      (item) => item.id !== node.props.source.id && item.id !== node.props.target.id && route.points.some((point, index) => index > 0 && segmentEnters(route.points[index - 1], point, item)),
    );
  };
  const dropLastLine = () => void lines.pop();

  /** Adds an item made elsewhere (a card or picture). */
  const add = (item: StudioItem) => void front.push(item);

  /**
   * The finished section: a heading above, everything moved so its top-left is
   * (0, 0). `reach` is room that lines need beyond the outermost shapes.
   */
  const finish = (title: string, reach: { left?: number; right?: number } = {}): SectionLayout => {
    const solid = front as Array<Exclude<StudioItem, ConnectorNode>>;
    const minX = Math.min(...solid.map((item) => item.x)) - (reach.left ?? 0);
    const minY = Math.min(...solid.map((item) => item.y));
    const maxX = Math.max(...solid.map((item) => item.x + item.w)) + (reach.right ?? 0);
    const maxY = Math.max(...solid.map((item) => item.y + item.h));
    const titleW = Math.max(240, Math.round(title.length * 15 + 24));
    const width = Math.round(Math.max(maxX - minX, titleW));
    // A heading wider than the drawing keeps the drawing centred under it.
    const shiftX = -minX + Math.round((width - (maxX - minX)) / 2);
    const shiftY = -minY + HEADING_H + HEADING_GAP;
    for (const item of solid) {
      item.x += shiftX;
      item.y += shiftY;
    }
    text({ x: 0, y: 0, w: width, h: HEADING_H }, title, 26);
    return { items: [...lines, ...front], width, height: Math.round(maxY - minY + HEADING_H + HEADING_GAP) };
  };

  return { shape, text, connect, lastLineIsClear, dropLastLine, add, finish };
}

const HEADING_H = 44;
const HEADING_GAP = 24;

// ── flowchart ────────────────────────────────────────────────────────────────

// Every node is the same width, so a line down a side clears the nodes it passes.
const FLOW_W = 250;
const FLOW_GAP_X = 90;
const FLOW_GAP_Y = 76;

type FlowDraft = Extract<SectionDraft, { type: "flowchart" }>;

/** The usable edges: both ends exist, no self-loops, one per pair. */
function flowEdges(draft: FlowDraft) {
  const ids = new Set(draft.nodes.map((node) => node.id));
  const seen = new Set<string>();
  return draft.edges.filter((edge) => {
    const key = `${edge.from} ${edge.to}`;
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Each node's row: below every node that leads to it. Edges that close a loop
 * are left out of the ranking and returned as `loops`.
 */
export function flowRanks(draft: FlowDraft): { rank: Map<string, number>; loops: Set<string> } {
  const edges = flowEdges(draft);
  const loops = new Set<string>();
  const state = new Map<string, "open" | "done">();
  const order: string[] = [];
  const visit = (id: string) => {
    state.set(id, "open");
    for (const edge of edges.filter((candidate) => candidate.from === id)) {
      if (state.get(edge.to) === "open") loops.add(`${edge.from} ${edge.to}`);
      else if (!state.has(edge.to)) visit(edge.to);
    }
    state.set(id, "done");
    order.unshift(id);
  };
  const starts = [...draft.nodes].sort((a, b) => Number(b.kind === "start") - Number(a.kind === "start"));
  for (const node of starts) if (!state.has(node.id)) visit(node.id);
  const rank = new Map<string, number>(draft.nodes.map((node) => [node.id, 0]));
  for (const id of order) {
    for (const edge of edges) {
      if (edge.from !== id || loops.has(`${edge.from} ${edge.to}`)) continue;
      rank.set(edge.to, Math.max(rank.get(edge.to) ?? 0, (rank.get(id) ?? 0) + 1));
    }
  }
  return { rank, loops };
}

const FLOW_TONE: Record<FlowDraft["nodes"][number]["kind"], Tone> = { start: "green", step: "blue", decision: "yellow", end: "purple" };

function flowHeight(node: FlowDraft["nodes"][number]): number {
  // A diamond's text has half its width and height; a pill's and a box's have most of it.
  if (node.kind === "decision") return Math.max(130, wrappedLines(node.text, FLOW_W * 0.5) * LINE_H * 2 + 20);
  return Math.max(node.kind === "step" ? 76 : 60, wrappedLines(node.text, FLOW_W * 0.84) * LINE_H + 30);
}

function layoutFlowchart(draft: FlowDraft, newId: () => string): SectionLayout {
  const { rank } = flowRanks(draft);
  const ranked: FlowDraft["nodes"][] = [];
  for (const node of draft.nodes) (ranked[rank.get(node.id) ?? 0] ??= []).push(node);
  const branched = ranked.filter(Boolean);
  // Branches side by side when every line can then be drawn cleanly; otherwise
  // one node per row, where a line that isn't to the next row goes round a side.
  return placeFlowchart(draft, branched, newId) ?? (placeFlowchart(draft, branched.flat().map((node) => [node]), newId, true) as SectionLayout);
}

/** The flowchart in these rows, or null when a line would cross a shape (unless `always`). */
function placeFlowchart(draft: FlowDraft, rows: FlowDraft["nodes"][], newId: () => string, always = false): SectionLayout | null {
  const out = builder(newId);
  const edges = flowEdges(draft);
  const { loops } = flowRanks(draft);
  const rowOf = new Map<string, number>();
  rows.forEach((row, index) => row.forEach((node) => rowOf.set(node.id, index)));

  // Each row is ordered by where its parents sit, then centred. A row's shapes
  // share one height, so the gaps between rows stay free for lines.
  const centre = new Map<string, number>();
  const boxes = new Map<string, Box>();
  const ids = new Map<string, string>();
  let top = 0;
  rows.forEach((row) => {
    const wanted = (id: string) => {
      const parents = edges.filter((edge) => edge.to === id && centre.has(edge.from)).map((edge) => centre.get(edge.from) as number);
      return parents.length ? parents.reduce((a, b) => a + b, 0) / parents.length : 0;
    };
    const sorted = row.map((node, index) => ({ node, index })).sort((a, b) => wanted(a.node.id) - wanted(b.node.id) || a.index - b.index).map((entry) => entry.node);
    const height = Math.max(...sorted.map(flowHeight));
    const total = sorted.length * FLOW_W + (sorted.length - 1) * FLOW_GAP_X;
    sorted.forEach((node, index) => {
      const x = -total / 2 + index * (FLOW_W + FLOW_GAP_X);
      boxes.set(node.id, { x, y: top, w: FLOW_W, h: height });
      centre.set(node.id, x + FLOW_W / 2);
    });
    top += height + FLOW_GAP_Y;
  });
  for (const node of draft.nodes) {
    const box = boxes.get(node.id) as Box;
    const kind: ShapeKind = node.kind === "decision" ? "diamond" : node.kind === "step" ? "rectangle" : "rounded-rectangle";
    ids.set(node.id, out.shape(kind, box, node.text, FLOW_TONE[node.kind], { radius: node.kind === "step" ? 10 : 30 }));
  }

  const outer = { left: Math.min(...[...boxes.values()].map((box) => box.x)), right: Math.max(...[...boxes.values()].map((box) => box.x + box.w)) };
  const reach = { left: 0, right: 0 };
  let turn = 0;
  for (const edge of edges) {
    const from = boxes.get(edge.from) as Box;
    const to = boxes.get(edge.to) as Box;
    const source = ids.get(edge.from) as string;
    const target = ids.get(edge.to) as string;
    const loop = loops.has(`${edge.from} ${edge.to}`);
    const options = { label: edge.label, mode: "elbow" as const, dashed: loop };
    if (!loop && (rowOf.get(edge.to) as number) - (rowOf.get(edge.from) as number) === 1) {
      // On a straight drop the label sits low, clear of the other branches' bend halfway down.
      out.connect({ id: source, side: "bottom" }, { id: target, side: "top" }, Math.abs(from.x - to.x) < 1 ? { ...options, labelAt: 0.72 } : options);
      if (always || out.lastLineIsClear()) continue;
      out.dropLastLine();
      return null;
    }
    // A loop or a skipped row goes round the outside: the nearer side first,
    // taking turns when both are as near so the lines don't pile up.
    const leftRoom = from.x - outer.left + (to.x - outer.left);
    const rightRoom = outer.right - (from.x + from.w) + (outer.right - (to.x + to.w));
    const first = leftRoom === rightRoom ? (turn++ % 2 ? "right" : "left") : leftRoom < rightRoom ? "left" : "right";
    const sides = [first, first === "left" ? "right" : "left"] as const;
    const side = sides.find((candidate) => {
      out.connect({ id: source, side: candidate }, { id: target, side: candidate }, options);
      const clear = out.lastLineIsClear();
      out.dropLastLine();
      return clear;
    });
    if (!side && !always) return null;
    const chosen = side ?? first;
    reach[chosen] = 28;
    out.connect({ id: source, side: chosen }, { id: target, side: chosen }, options);
  }
  return out.finish(draft.heading, reach);
}

// ── labelled diagram ─────────────────────────────────────────────────────────

const PART_W = 210;
const PART_H = 90;

function layoutDiagram(draft: Extract<SectionDraft, { type: "diagram" }>, newId: () => string): SectionLayout {
  const out = builder(newId);
  const gap = draft.joiner ? 56 : 24;
  const detailH = Math.max(96, Math.max(...draft.parts.map((part) => wrappedLines(part.detail, PART_W * 0.84))) * LINE_H + 40);
  draft.parts.forEach((part, index) => {
    const x = index * (PART_W + gap);
    const tone = CYCLE[index % CYCLE.length];
    const head = out.shape("rectangle", { x, y: 0, w: PART_W, h: PART_H }, part.name, tone, { radius: 8 });
    const detail = out.shape("rounded-rectangle", { x, y: PART_H + 64, w: PART_W, h: detailH }, part.detail, "plain");
    out.connect({ id: head, side: "bottom" }, { id: detail, side: "top" }, { arrow: false, dashed: true });
    if (draft.joiner && index < draft.parts.length - 1) {
      out.text({ x: x + PART_W + 8, y: PART_H / 2 - 22, w: gap - 16, h: 44 }, draft.joiner, 28);
    }
  });
  return out.finish(draft.heading);
}

// ── comparison table ─────────────────────────────────────────────────────────

const LABEL_W = 170;
const CELL_W = 240;
const CELL_GAP = 6;

function layoutComparison(draft: Extract<SectionDraft, { type: "comparison" }>, newId: () => string): SectionLayout {
  const out = builder(newId);
  const columnX = (index: number) => LABEL_W + CELL_GAP + index * (CELL_W + CELL_GAP);
  const headH = Math.max(60, Math.max(...draft.columns.map((name) => wrappedLines(name, CELL_W * 0.88))) * LINE_H + 28);
  draft.columns.forEach((name, index) => out.shape("rectangle", { x: columnX(index), y: 0, w: CELL_W, h: headH }, name, CYCLE[index % CYCLE.length], { radius: 8 }));
  let top = headH + CELL_GAP;
  for (const row of draft.rows) {
    const cells = draft.columns.map((_, index) => row.cells[index] ?? "");
    const lines = Math.max(wrappedLines(row.label, LABEL_W * 0.88), ...cells.map((cell) => wrappedLines(cell, CELL_W * 0.88)));
    const h = Math.max(60, lines * LINE_H + 28);
    out.shape("rectangle", { x: 0, y: top, w: LABEL_W, h }, row.label, "yellow", { radius: 8 });
    cells.forEach((cell, index) => out.shape("rectangle", { x: columnX(index), y: top, w: CELL_W, h }, cell || "—", "plain", { radius: 8 }));
    top += h + CELL_GAP;
  }
  return out.finish(draft.heading);
}

// ── timeline / roadmap ───────────────────────────────────────────────────────

const STOP_W = 220;
const STOP_GAP = 30;
const DOT = 48;

function layoutTimeline(draft: Extract<SectionDraft, { type: "timeline" }>, newId: () => string): SectionLayout {
  const out = builder(newId);
  const cardText = (stop: (typeof draft.milestones)[number]) => [stop.title, stop.detail].filter(Boolean).join("\n");
  const cardH = Math.max(100, Math.max(...draft.milestones.map((stop) => wrappedLines(cardText(stop), STOP_W * 0.84))) * LINE_H + 40);
  const dots = draft.milestones.map((_, index) => out.shape("circle", { x: index * (STOP_W + STOP_GAP) + (STOP_W - DOT) / 2, y: 0, w: DOT, h: DOT }, String(index + 1), CYCLE[index % CYCLE.length]));
  draft.milestones.forEach((stop, index) => {
    const x = index * (STOP_W + STOP_GAP);
    // In a pill, because plain text shrinks to its words and would drift off centre.
    if (stop.when) out.shape("rounded-rectangle", { x: x + 30, y: -56, w: STOP_W - 60, h: 40 }, stop.when, "plain", { radius: 20 });
    const card = out.shape("rounded-rectangle", { x, y: DOT + 48, w: STOP_W, h: cardH }, cardText(stop), "plain");
    out.connect({ id: dots[index], side: "bottom" }, { id: card, side: "top" }, { arrow: false });
    if (index) out.connect({ id: dots[index - 1], side: "right" }, { id: dots[index], side: "left" });
  });
  return out.finish(draft.heading);
}

// ── media row ────────────────────────────────────────────────────────────────

const CARD = { w: 280, h: 88 };
const MEDIA_GAP = 28;

function layoutMedia(section: MediaSection, newId: () => string): SectionLayout {
  const out = builder(newId);
  const videos = section.videos.slice(0, SECTION_LIMITS.videos);
  videos.forEach((video, index) => {
    out.add({
      id: newId(),
      type: "resource-card",
      x: index * (CARD.w + MEDIA_GAP),
      y: 0,
      ...CARD,
      rotation: 0,
      zIndex: 0,
      props: { assetId: video.assetId, kind: "video", title: video.title.slice(0, 300), sourceHost: video.sourceHost ?? "www.youtube.com" },
    });
  });
  const pictureTop = videos.length ? CARD.h + MEDIA_GAP : 0;
  let x = 0;
  for (const image of section.images.slice(0, SECTION_LIMITS.images)) {
    const size = mapImageSize(image);
    const column = Math.max(size.w, 200);
    out.add({ id: newId(), type: "image", x, y: pictureTop, ...size, rotation: 0, zIndex: 0, props: { src: image.src, alt: image.alt } });
    out.text({ x, y: pictureTop + size.h + 6, w: column, h: 40 }, `Picture: ${image.alt}\n${image.credit}, Wikimedia Commons`, 12, "#6b6b6b");
    x += column + MEDIA_GAP;
  }
  return out.finish(section.heading);
}

// ── one section, then a whole board ──────────────────────────────────────────

/** A section as board elements, or null when there is nothing to show. */
export function layoutSection(section: BoardSection, newId: () => string): SectionLayout | null {
  switch (section.type) {
    case "flowchart":
      return flowEdges(section).length ? layoutFlowchart(section, newId) : null;
    case "diagram":
      return layoutDiagram(section, newId);
    case "comparison":
      return layoutComparison(section, newId);
    case "timeline":
      return layoutTimeline(section, newId);
    case "media":
      return section.videos.length || section.images.length ? layoutMedia(section, newId) : null;
  }
}

const SECTION_GAP = 120;
const TITLE_H = 64;

/**
 * Sections one under another, centred, with the board's title on top. Reading
 * order is the order given. Elements come back with their stacking order set.
 */
export function composeBoard(title: string, sections: readonly BoardSection[], newId: () => string): StudioItem[] {
  const layouts = sections
    .slice(0, SECTION_LIMITS.sections)
    .map((section) => layoutSection(section, newId))
    .filter((layout): layout is SectionLayout => layout !== null);
  const width = Math.max(600, ...layouts.map((layout) => layout.width), Math.round(title.length * 19));
  const items: StudioItem[] = [{ id: newId(), type: "free-text", x: 0, y: 0, w: width, h: TITLE_H, rotation: 0, zIndex: 0, props: { text: title, color: INK, fontSize: 34 } }];
  let top = TITLE_H + 60;
  for (const layout of layouts) {
    const left = Math.round((width - layout.width) / 2);
    for (const item of layout.items) items.push(item.type === "connector" ? item : ({ ...item, x: item.x + left, y: item.y + top } as StudioItem));
    top += layout.height + SECTION_GAP;
  }
  // Lines under the shapes and cards they join.
  const ordered = [...items.filter((item) => item.type === "connector"), ...items.filter((item) => item.type !== "connector")];
  return ordered.map((item, index) => ({ ...item, zIndex: index + 1 }) as StudioItem);
}
