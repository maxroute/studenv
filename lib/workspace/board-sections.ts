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
import { mapImageSize, type MapDraft, type MapImage } from "./mind-map";
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
  return (
    placeFlowchart(draft, branched, newId) ??
    placeFlowchart(draft, branched, newId, "edge") ??
    (placeFlowchart(draft, branched.flat().map((node) => [node]), newId, "column") as SectionLayout)
  );
}

/**
 * The flowchart in these rows, or null when a line would cross a shape. Rows
 * are centred; with "edge", the shapes a loop or skipped row joins are put in
 * the outermost column instead, so its line runs outside the whole chart.
 * "column" always succeeds: one shape per row.
 */
function placeFlowchart(draft: FlowDraft, rows: FlowDraft["nodes"][], newId: () => string, mode: "centred" | "edge" | "column" = "centred"): SectionLayout | null {
  const always = mode === "column";
  const out = builder(newId);
  const edges = flowEdges(draft);
  const { loops } = flowRanks(draft);
  const rowOf = new Map<string, number>();
  rows.forEach((row, index) => row.forEach((node) => rowOf.set(node.id, index)));

  // Lines that loop back or skip a row go round the outside, so the shapes they
  // join sit at the right end of their rows, where nothing is in their way.
  const outside = new Set(
    edges
      .filter((edge) => loops.has(`${edge.from} ${edge.to}`) || (rowOf.get(edge.to) as number) - (rowOf.get(edge.from) as number) !== 1)
      .flatMap((edge) => [edge.from, edge.to]),
  );

  // Each row is ordered by where its parents sit, then centred. A row's shapes
  // share one height, so the gaps between rows stay free for lines.
  const centre = new Map<string, number>();
  const boxes = new Map<string, Box>();
  const ids = new Map<string, string>();
  const columns = Math.max(...rows.map((row) => row.length));
  const columnX = (column: number) => (column - (columns - 1) / 2) * (FLOW_W + FLOW_GAP_X) - FLOW_W / 2;
  let top = 0;
  rows.forEach((row) => {
    const wanted = (id: string) => {
      const parents = edges.filter((edge) => edge.to === id && centre.has(edge.from)).map((edge) => centre.get(edge.from) as number);
      return parents.length ? parents.reduce((a, b) => a + b, 0) / parents.length : 0;
    };
    const sorted = row
      .map((node, index) => ({ node, index }))
      .sort((a, b) => Number(outside.has(a.node.id)) - Number(outside.has(b.node.id)) || wanted(a.node.id) - wanted(b.node.id) || a.index - b.index)
      .map((entry) => entry.node);
    const height = Math.max(...sorted.map(flowHeight));
    const last = sorted[sorted.length - 1];
    const toEdge = mode === "edge" && outside.has(last.id);
    // Centred in the columns, or in all but the outermost when that one is taken.
    const free = toEdge ? columns - 1 : columns;
    const centred = toEdge ? sorted.slice(0, -1) : sorted;
    const slot = (node: FlowDraft["nodes"][number], index: number) => (toEdge && node === last ? columns - 1 : index + (free - centred.length) / 2);
    sorted.forEach((node, index) => {
      const x = columnX(slot(node, index));
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
  return stackBlocks(title, layouts, newId);
}

// ── what Rangan writes ───────────────────────────────────────────────────────

export const SECTION_PLAN_MAX = 3;
export const MEDIA_MAX_VIDEOS = 3;
export const MEDIA_MAX_IMAGES = 3;

/** The sections, video searches and pictures Rangan plans for a board. */
export type SectionPlan = { sections: SectionDraft[]; videos: string[]; images: string[] };

export function sectionsInstruction(request: string, subject: string): string {
  return [
    `The student asked: """${request.slice(0, 1_500)}"""`,
    `Plan the diagrams for a study board on "${subject}". A mind map of the main ideas is made separately; these diagrams explain what a mind map can't.`,
    `sections: 1 to ${SECTION_PLAN_MAX} of these, only where the subject really has one. Never two of the same type.`,
    `- flowchart: a process, algorithm or decision. nodes (3 to 10): id ("a", "b"…), kind ("start", "step", "decision" or "end") and text (under 10 words). edges: from, to and a label ("yes"/"no" after a decision, else ""). Keep it a main path down the page with short side exits; one loop back at most. Every decision has a "yes" and a "no" edge going to different nodes. Each different outcome ends in its own end node, like "Access granted" and "Reject with 401": a failed check never leads to a success. Check every edge says what really happens.`,
    `- diagram: one thing made of named parts in order (a JWT's header, payload and signature; a URL's parts; the layers of a stack). parts (2 to ${SECTION_LIMITS.parts}): name (1 to 3 words) and detail (one sentence). joiner: what goes between parts if something does, like "." or "→", else "".`,
    `- comparison: two to ${SECTION_LIMITS.columns} things the student must tell apart. columns: their names. rows (2 to 6): label (the point compared) and cells (one short phrase per column).`,
    `- timeline: a history, a lifecycle or a learning roadmap. milestones (3 to ${SECTION_LIMITS.milestones}): when (a date, "Step 1" or "Week 1"; "" if none), title (1 to 5 words) and detail (under 15 words).`,
    'Each section has a type and a heading (under 8 words) that says what it shows.',
    `videos: up to ${MEDIA_MAX_VIDEOS} YouTube searches (3 to 6 words each), each for a short lesson on a different part of the subject, like "jwt signature verification explained". Empty if videos would not help.`,
    `images: up to ${MEDIA_MAX_IMAGES} exact English Wikipedia article titles whose picture shows something from the subject, other than the subject's own article. Empty if pictures would not help.`,
    "Use the passages where they cover something. Write in the language of the request. Never mention passage numbers.",
    'Reply with only a JSON object: {"sections": [{"type": "flowchart", "heading": "...", "nodes": [{"id": "a", "kind": "start", "text": "..."}], "edges": [{"from": "a", "to": "b", "label": ""}]}], "videos": ["..."], "images": ["..."]}',
  ].join("\n");
}

const clip = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").replace(/\s*\[\d{1,2}\]/g, "").trim().slice(0, max) : "");
const list = (value: unknown, max: number): unknown[] => (Array.isArray(value) ? value.slice(0, max) : []);
const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/**
 * A table row's cells in column order. Models write them as a list, as an
 * object keyed by column name, or as keys on the row itself.
 */
function rowCells(row: Record<string, unknown>, columns: string[]): unknown[] {
  const given = row.cells ?? row.values;
  if (Array.isArray(given)) return given.slice(0, columns.length);
  const keyed = given && typeof given === "object" ? (given as Record<string, unknown>) : row;
  const byName = new Map(Object.entries(keyed).map(([key, value]) => [key.trim().toLowerCase(), value]));
  const found = columns.map((column) => byName.get(column.toLowerCase()));
  if (found.some((value) => typeof value === "string" && value.trim())) return found;
  // Keyed some other way: take the values in order, if there is one per column.
  if (keyed !== row) {
    const values = Object.values(keyed);
    if (values.length === columns.length) return values;
  }
  return [];
}

/** One section from the model, trimmed to the limits; null when it isn't usable. */
function readSection(raw: unknown): SectionDraft | null {
  const entry = record(raw);
  const heading = clip(entry.heading, 80);
  let shaped: unknown;
  switch (entry.type) {
    case "flowchart":
      shaped = {
        type: "flowchart",
        heading,
        nodes: list(entry.nodes, SECTION_LIMITS.flowNodes).map((node) => {
          const value = record(node);
          return { id: clip(value.id, 20), kind: ["start", "step", "decision", "end"].includes(String(value.kind)) ? value.kind : "step", text: clip(value.text, 90) };
        }),
        edges: list(entry.edges, SECTION_LIMITS.flowEdges).map((edge) => {
          const value = record(edge);
          return { from: clip(value.from, 20), to: clip(value.to, 20), label: clip(value.label, 16) };
        }),
      };
      break;
    case "diagram":
      shaped = {
        type: "diagram",
        heading,
        joiner: clip(entry.joiner, 3),
        parts: list(entry.parts, SECTION_LIMITS.parts).map((part) => ({ name: clip(record(part).name, 30), detail: clip(record(part).detail, 160) })),
      };
      break;
    case "comparison": {
      const columns = list(entry.columns, SECTION_LIMITS.columns).map((column) => clip(column, 40));
      const rows = list(entry.rows, SECTION_LIMITS.rows)
        .map((row) => ({ label: clip(record(row).label, 40), cells: rowCells(record(row), columns).map((cell) => clip(cell, 120)) }))
        // A row with nothing filled in says nothing; a table of them would be a grid of dashes.
        .filter((row) => row.cells.some(Boolean));
      if (rows.length < 2) return null;
      shaped = { type: "comparison", heading, columns, rows };
      break;
    }
    case "timeline":
      shaped = {
        type: "timeline",
        heading,
        milestones: list(entry.milestones, SECTION_LIMITS.milestones).map((stop) => {
          const value = record(stop);
          return { when: clip(value.when, 24), title: clip(value.title, 50), detail: clip(value.detail, 120) };
        }),
      };
      break;
    default:
      return null;
  }
  const parsed = sectionDraftSchema.safeParse(shaped);
  if (!parsed.success) return null;
  // A flowchart needs at least one line between its own steps to be drawn.
  return parsed.data.type === "flowchart" && !flowEdges(parsed.data).length ? null : parsed.data;
}

/** The model's plan, keeping only usable sections, at most one of each type. */
export function parseSectionsReply(object: Record<string, unknown> | null): SectionPlan {
  if (!object) return { sections: [], videos: [], images: [] };
  const sections: SectionDraft[] = [];
  for (const raw of list(object.sections, 8)) {
    const section = readSection(raw);
    if (section && !sections.some((other) => other.type === section.type)) sections.push(section);
    if (sections.length >= SECTION_PLAN_MAX) break;
  }
  const distinct = (values: unknown, max: number, length: number) =>
    [...new Set(list(values, 10).map((value) => clip(value, length)).filter((value) => value && !/^(null|none|n\/a)$/i.test(value)))].slice(0, max);
  return { sections, videos: distinct(object.videos, MEDIA_MAX_VIDEOS, 80), images: distinct(object.images, MEDIA_MAX_IMAGES, 80) };
}

/**
 * Blocks one under another, centred, with an optional title on top. Each
 * block's items have its top-left at (0, 0). Elements come back with their
 * stacking order set: lines under the shapes and cards they join.
 */
export function stackBlocks(title: string | null, blocks: readonly SectionLayout[], newId: () => string): StudioItem[] {
  const width = Math.max(600, ...blocks.map((block) => block.width), title ? Math.round(title.length * 19) : 0);
  const items: StudioItem[] = title ? [{ id: newId(), type: "free-text", x: 0, y: 0, w: width, h: TITLE_H, rotation: 0, zIndex: 0, props: { text: title, color: INK, fontSize: 34 } }] : [];
  let top = title ? TITLE_H + 60 : 0;
  for (const block of blocks) {
    const left = Math.round((width - block.width) / 2);
    for (const item of block.items) items.push(item.type === "connector" ? item : ({ ...item, x: item.x + left, y: item.y + top } as StudioItem));
    top += block.height + SECTION_GAP;
  }
  const ordered = [...items.filter((item) => item.type === "connector"), ...items.filter((item) => item.type !== "connector")];
  return ordered.map((item, index) => ({ ...item, zIndex: index + 1 }) as StudioItem);
}

/** Items already laid out elsewhere (like a mind map) as a block: moved so their top-left is (0, 0). */
export function asBlock(items: readonly StudioItem[]): SectionLayout {
  const solid = items.filter((item): item is Exclude<StudioItem, ConnectorNode> => item.type !== "connector");
  const minX = Math.min(...solid.map((item) => item.x));
  const minY = Math.min(...solid.map((item) => item.y));
  const moved = items.map((item) => (item.type === "connector" ? item : ({ ...item, x: item.x - minX, y: item.y - minY } as StudioItem)));
  const placed = moved.filter((item): item is Exclude<StudioItem, ConnectorNode> => item.type !== "connector");
  return { items: moved, width: Math.max(...placed.map((item) => item.x + item.w)), height: Math.max(...placed.map((item) => item.y + item.h)) };
}

// ── a map that leaves the detail to its diagrams ─────────────────────────────

const LITTLE_WORDS = new Set(["a", "an", "and", "the", "of", "to", "in", "on", "for", "with", "vs", "versus", "how", "what", "is", "are", "its", "it", "by", "or", "from"]);

/**
 * A text's meaningful words for comparing two short labels: lower-case, cut
 * to their first five letters so forms of a word match ("validate", "valid";
 * "authorize", "authorized"; "token", "tokens").
 */
function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word && !LITTLE_WORDS.has(word))
      .map((word) => [...word].slice(0, 5).join("")),
  );
}

/** The share of `a`'s words that are also in `b` (0 when `a` has none). */
function shared(a: Set<string>, b: Set<string>): number {
  if (!a.size) return 0;
  let count = 0;
  for (const word of a) if (b.has(word)) count += 1;
  return count / a.size;
}

/** Everything a diagram shows, as labels to compare with a map's sub-points. */
function sectionLabels(section: SectionDraft): string[] {
  switch (section.type) {
    case "flowchart":
      return section.nodes.map((node) => node.text);
    case "diagram":
      return section.parts.map((part) => part.name);
    case "comparison":
      return [...section.columns, ...section.rows.map((row) => row.label)];
    case "timeline":
      return section.milestones.map((stop) => stop.title);
  }
}

/**
 * The map with the detail its diagrams show taken out: a branch keeps its
 * title and note (the big picture) but not the sub-points a diagram already
 * shows. A sub-point counts as shown when every meaningful word of it is in
 * one of the diagram's labels, or a label of two or more words is wholly in
 * it. A branch is trimmed only when a diagram shows at least half of its
 * sub-points, so a word in common here and there removes nothing.
 */
export function leaveDetailToDiagrams(draft: MapDraft, sections: readonly SectionDraft[]): MapDraft {
  const diagrams = sections.map((section) => sectionLabels(section).map(keywords).filter((label) => label.size > 0));
  const branches = draft.branches.map((branch) => {
    let children = branch.children;
    for (const diagram of diagrams) {
      const shows = (text: string) => {
        const words = keywords(text);
        return words.size > 0 && diagram.some((label) => shared(words, label) === 1 || (label.size > 1 && shared(label, words) === 1));
      };
      if (children.length && children.filter((child) => shows(child.title)).length * 2 >= children.length) children = children.filter((child) => !shows(child.title));
    }
    // Steps with some taken out are no longer a sequence.
    return { ...branch, children, steps: branch.steps && children.length === branch.children.length };
  });
  // Links to sub-points that were taken out have nothing to point at.
  const titles = new Set(branches.flatMap((branch) => [branch.title, ...branch.children.map((child) => child.title)]).map((title) => title.toLowerCase()));
  const links = draft.links.filter((link) => titles.has(link.from.toLowerCase()) && titles.has(link.to.toLowerCase()));
  return { ...draft, branches, links };
}
