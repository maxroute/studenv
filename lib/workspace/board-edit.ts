// ---------------------------------------------------------------------------
// Rangan changes the open board: additions placed in free space
// ---------------------------------------------------------------------------
//
// Pure: no React, store or model. The board is described to the model as
// short keys ("e3"); the model answers with a small plan of additions; the
// plan is checked and applied here. Rangan only adds: new stickies joined to
// what they belong to, labelled connectors between existing elements, exam
// tips, and groups. It never deletes, moves or rewrites the student's work.

import { z } from "zod";
import type { ConnectorNode, StudioItem } from "@/types/workspace";
import { MAP_COLORS, stickyText, type MapNode } from "./mind-map";

export type BoardElement = { key: string; id: string; type: string; text: string; x: number; y: number; w: number; h: number; selected: boolean; locked: boolean };
export type BoardEdge = { from: string; to: string; label: string };
export type BoardSummary = { elements: BoardElement[]; edges: BoardEdge[] };

/** Elements described to the model; a bigger board is cut, selected ones first. */
export const BOARD_SUMMARY_MAX = 150;
const TEXT_MAX = 160;

const elementText = (item: StudioItem): string => {
  switch (item.type) {
    case "text":
    case "sticky":
    case "free-text":
      return item.props.text;
    case "note-card":
      return `Page: ${item.props.title}`;
    case "resource-card":
      return `${item.props.kind.toUpperCase()}: ${item.props.title}`;
    case "pdf-page":
    case "pdf-fragment":
      return `PDF page ${item.props.pageNumber}`;
    case "video-anchor":
      return `Video: ${item.props.label ?? ""}`;
    case "image":
      return `Image: ${item.props.alt ?? ""}`;
    case "group":
      return `Group: ${item.props.label ?? ""}`;
    case "shape":
      return `Shape: ${item.props.kind}`;
    default:
      return item.type;
  }
};

/** The board as the model sees it: elements by key (selected ones first) and the connectors between them. */
export function boardSummary(items: readonly StudioItem[], selectedIds: readonly string[]): BoardSummary {
  const selected = new Set(selectedIds);
  const candidates = items
    .filter((item) => item.type !== "connector" && item.type !== "drawing")
    .sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)))
    .slice(0, BOARD_SUMMARY_MAX);
  const elements = candidates.map((item, index) => ({
    key: `e${index + 1}`,
    id: item.id,
    type: item.type,
    text: elementText(item).replace(/\s+/g, " ").trim().slice(0, TEXT_MAX),
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    selected: selected.has(item.id),
    locked: (item.props as { locked?: boolean }).locked === true,
  }));
  const keyOf = new Map(elements.map((element) => [element.id, element.key]));
  const edges = items.flatMap((item) => {
    if (item.type !== "connector") return [];
    const from = item.props.source.id ? keyOf.get(item.props.source.id) : undefined;
    const to = item.props.target.id ? keyOf.get(item.props.target.id) : undefined;
    return from && to ? [{ from, to, label: item.props.label?.text ?? "" }] : [];
  });
  return { elements, edges };
}

export function boardEditInstruction(request: string, title: string, summary: BoardSummary): string {
  return [
    `The student has the board "${title}" open and asked: """${request.slice(0, 1_500)}"""`,
    "The board's elements (key, kind, text; * marks what the student has selected):",
    ...summary.elements.map((element) => `${element.key}${element.selected ? "*" : ""} (${element.type}) ${element.text}`),
    "Connections:",
    ...(summary.edges.length ? summary.edges.map((edge) => `${edge.from} -> ${edge.to}${edge.label ? ` "${edge.label}"` : ""}`) : ["(none)"]),
    "",
    "Make only what the student asked for. You can only add; never remove or change existing elements.",
    'Changes you can make: {"add": {"to": "e3", "title": "...", "note": "...", "label": "...", "children": [{"title": "...", "note": "..."}], "also": [{"to": "e5", "label": "..."}]}} adds a sticky joined to e3 (or to nothing with "to": null), with sub-notes; "also" joins the new sticky to other existing elements too;',
    'Join a new sticky to exactly the element the student named. To connect a new sticky to something, use "also" on its add, not a separate connect.',
    '{"connect": {"from": "e2", "to": "e5", "label": "..."}} joins two existing elements; {"tips": ["..."]} adds exam-tip stickies; {"group": ["e1", "e2"]} groups elements so they move together.',
    'When the student says "this", "these" or "selected", they mean the elements marked *. Titles 1 to 5 words; notes under 15 words; labels 1 or 2 words.',
    "Write in the language of the board.",
    'Reply with only a JSON object: {"summary": "one sentence saying what you would add, e.g. \"Two exam tips on deadlocks.\"", "changes": [ ... ]}',
  ].join("\n");
}

export type BoardChange =
  | { kind: "add"; to: string | null; node: MapNode; label: string; children: MapNode[]; also: Array<{ to: string; label: string }> }
  | { kind: "connect"; from: string; to: string; label: string }
  | { kind: "tips"; tips: string[] }
  | { kind: "group"; keys: string[] };

const words = (max: number) => z.string().transform((value) => value.replace(/\s+/g, " ").replace(/\s*\[\d{1,2}\]/g, "").trim().slice(0, max));
const rawNode = z.object({ title: words(60).pipe(z.string().min(1)), note: words(160).optional() });

export const MAX_BOARD_CHANGES = 8;
const MAX_ADDED_CHILDREN = 6;

/** The model's plan, kept only for keys on the board; null when nothing usable is left. */
export function parseBoardPlan(object: Record<string, unknown> | null, summary: BoardSummary): { summary: string; changes: BoardChange[] } | null {
  const keys = new Set(summary.elements.map((element) => element.key));
  const changes: BoardChange[] = [];
  for (const entry of Array.isArray(object?.changes) ? object.changes : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (record.add && typeof record.add === "object") {
      const add = record.add as Record<string, unknown>;
      const node = rawNode.safeParse(add);
      const to = typeof add.to === "string" && keys.has(add.to) ? add.to : null;
      if (!node.success || (add.to !== null && add.to !== undefined && to === null)) continue;
      const children = (Array.isArray(add.children) ? add.children : []).flatMap((child) => {
        const parsed = rawNode.safeParse(child);
        return parsed.success ? [{ title: parsed.data.title, note: parsed.data.note ?? "" }] : [];
      });
      const label = words(30).safeParse(add.label);
      const also = (Array.isArray(add.also) ? add.also : []).flatMap((link) => {
        const parsed = z.object({ to: z.string(), label: words(30).optional() }).safeParse(link);
        return parsed.success && keys.has(parsed.data.to) && parsed.data.to !== to ? [{ to: parsed.data.to, label: parsed.data.label ?? "" }] : [];
      });
      changes.push({ kind: "add", to, node: { title: node.data.title, note: node.data.note ?? "" }, label: label.success ? label.data : "", children: children.slice(0, MAX_ADDED_CHILDREN), also: also.slice(0, 3) });
    } else if (record.connect && typeof record.connect === "object") {
      const connect = record.connect as Record<string, unknown>;
      if (typeof connect.from !== "string" || typeof connect.to !== "string" || !keys.has(connect.from) || !keys.has(connect.to) || connect.from === connect.to) continue;
      const label = words(30).safeParse(connect.label);
      changes.push({ kind: "connect", from: connect.from, to: connect.to, label: label.success ? label.data : "" });
    } else if (Array.isArray(record.tips)) {
      const tips = record.tips
        .flatMap((tip) => (typeof tip === "string" ? [tip.replace(/\s+/g, " ").trim().replace(/^exam tip\s*[:.-]\s*/i, "").slice(0, 200)] : []))
        .filter(Boolean)
        .slice(0, 4);
      if (tips.length) changes.push({ kind: "tips", tips });
    } else if (Array.isArray(record.group)) {
      const group = [...new Set(record.group.filter((key): key is string => typeof key === "string" && keys.has(key)))];
      if (group.length >= 2) changes.push({ kind: "group", keys: group });
    }
    if (changes.length >= MAX_BOARD_CHANGES) break;
  }
  if (changes.length === 0) return null;
  const text = typeof object?.summary === "string" ? object.summary.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  return { summary: text || "Rangan suggests these additions.", changes };
}

// ── placing new elements in free space ───────────────────────────────────────

type Box = { x: number; y: number; w: number; h: number };
const MARGIN = 28;
const STICKY = { w: 220, h: 120 };
const CHILD = { w: 200, h: 100 };
const TIP = { w: 230, h: 140 };
const COLUMN_GAP = 90;
const CHILD_GAP = 20;

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w + MARGIN && b.x < a.x + a.w + MARGIN && a.y < b.y + b.h + MARGIN && b.y < a.y + a.h + MARGIN;

/**
 * The nearest free spot for a `size` box beside `anchor`: right first, then
 * below, left and above, stepping further out until nothing is in the way.
 */
export function placeNear(anchor: Box, size: { w: number; h: number }, obstacles: readonly Box[]): Box {
  for (let ring = 0; ring < 40; ring += 1) {
    const reach = 120 + ring * 90;
    const candidates: Box[] = [
      { x: anchor.x + anchor.w + reach, y: anchor.y + (anchor.h - size.h) / 2, ...size },
      { x: anchor.x + (anchor.w - size.w) / 2, y: anchor.y + anchor.h + reach, ...size },
      { x: anchor.x - reach - size.w, y: anchor.y + (anchor.h - size.h) / 2, ...size },
      { x: anchor.x + (anchor.w - size.w) / 2, y: anchor.y - reach - size.h, ...size },
    ];
    const free = candidates.find((box) => obstacles.every((obstacle) => !overlaps(box, obstacle)));
    if (free) return { ...free, x: Math.round(free.x), y: Math.round(free.y) };
  }
  // A board this crowded: past the right edge of everything.
  const right = Math.max(anchor.x + anchor.w, ...obstacles.map((o) => o.x + o.w));
  return { x: Math.round(right + 200), y: Math.round(anchor.y), ...size };
}

const connectorItem = (id: string, from: string, to: string, zIndex: number, label: string, dashed = false): ConnectorNode => ({
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
    color: dashed ? "#b07b2c" : "#8a8a8a",
    strokeWidth: 2,
    strokeStyle: dashed ? "dash" : "solid",
    frontEndpointStyle: "none",
    rearEndpointStyle: "arrow",
    ...(label ? { label: { text: label, offset: 0.5 } } : {}),
  },
});

/**
 * The board after the plan: everything already there unchanged (only a
 * `groupId` is set when grouping), plus the new stickies and connectors.
 * Returns null when an element the plan uses has gone from the board.
 */
export function applyBoardPlan(
  items: readonly StudioItem[],
  changes: readonly BoardChange[],
  summary: BoardSummary,
  options: { newId: () => string; viewportCentre: { x: number; y: number } },
): { items: StudioItem[]; addedIds: string[] } | null {
  const idOf = new Map(summary.elements.map((element) => [element.key, element.id]));
  const present = new Set(items.map((item) => item.id));
  const used = changes.flatMap((change) =>
    change.kind === "add" ? [...(change.to ? [change.to] : []), ...change.also.map((link) => link.to)] : change.kind === "connect" ? [change.from, change.to] : change.kind === "group" ? change.keys : [],
  );
  if (used.some((key) => !present.has(idOf.get(key) ?? ""))) return null;

  let next: StudioItem[] = [...items];
  const added: StudioItem[] = [];
  let z = Math.max(0, ...items.map((item) => item.zIndex)) + 1;
  const obstacles = (): Box[] => [...next, ...added].filter((item) => item.type !== "connector");
  const byId = (id: string) => [...next, ...added].find((item) => item.id === id);
  const colorOf = (item: StudioItem | undefined) => (item?.type === "sticky" && item.props.color) || MAP_COLORS[0];
  const contentBox = (): Box => {
    const solid = obstacles();
    if (solid.length === 0) return { x: options.viewportCentre.x - 1, y: options.viewportCentre.y - 1, w: 2, h: 2 };
    const minX = Math.min(...solid.map((b) => b.x));
    const minY = Math.min(...solid.map((b) => b.y));
    return { x: minX, y: minY, w: Math.max(...solid.map((b) => b.x + b.w)) - minX, h: Math.max(...solid.map((b) => b.y + b.h)) - minY };
  };
  const sticky = (box: Box, text: string, color: string, groupId?: string): StudioItem => ({
    id: options.newId(),
    type: "sticky",
    ...box,
    rotation: 0,
    zIndex: z++,
    props: { text, color, ...(groupId ? { groupId } : {}) },
  });

  for (const change of changes) {
    if (change.kind === "add") {
      const anchor = change.to ? byId(idOf.get(change.to) ?? "") : undefined;
      const color = colorOf(anchor);
      const groupId = change.children.length ? `rangan-${options.newId()}` : undefined;
      // The new sticky and its sub-notes are placed as one block, so they stay together.
      const columnHeight = change.children.length * (CHILD.h + CHILD_GAP) - CHILD_GAP;
      const block = { w: change.children.length ? STICKY.w + COLUMN_GAP + CHILD.w : STICKY.w, h: Math.max(STICKY.h, columnHeight) };
      const from = anchor ?? contentBox();
      const spot = placeNear(from, block, obstacles());
      // A block left of what it joins has its sub-notes on the far (left) side.
      const mirrored = spot.x + spot.w <= from.x;
      const parentBox = { x: mirrored ? spot.x + spot.w - STICKY.w : spot.x, y: spot.y + (block.h - STICKY.h) / 2, ...STICKY };
      const parent = sticky({ ...parentBox, x: Math.round(parentBox.x), y: Math.round(parentBox.y) }, stickyText(change.node), color, groupId);
      added.push(parent);
      if (anchor) added.push(connectorItem(options.newId(), anchor.id, parent.id, 0, change.label));
      for (const link of change.also) added.push(connectorItem(options.newId(), parent.id, idOf.get(link.to) ?? "", 0, link.label, true));
      change.children.forEach((child, index) => {
        const childBox = { x: Math.round(mirrored ? spot.x : spot.x + STICKY.w + COLUMN_GAP), y: Math.round(spot.y + (block.h - columnHeight) / 2 + index * (CHILD.h + CHILD_GAP)), ...CHILD };
        const childItem = sticky(childBox, stickyText(child), color, groupId);
        added.push(childItem, connectorItem(options.newId(), parent.id, childItem.id, 0, ""));
      });
    } else if (change.kind === "connect") {
      added.push(connectorItem(options.newId(), idOf.get(change.from) ?? "", idOf.get(change.to) ?? "", 0, change.label, true));
    } else if (change.kind === "tips") {
      const area = contentBox();
      let anchor: Box = { x: area.x + area.w / 2 - TIP.w / 2, y: area.y + area.h, w: TIP.w, h: 1 };
      for (const tip of change.tips) {
        const box = placeNear(anchor, TIP, obstacles());
        added.push(sticky(box, `Exam tip\n${tip}`, "#F8E7A1"));
        anchor = box;
      }
    } else {
      const groupId = `rangan-${options.newId()}`;
      const ids = new Set(change.keys.map((key) => idOf.get(key)));
      next = next.map((item) => (ids.has(item.id) && (item.props as { locked?: boolean }).locked !== true ? ({ ...item, props: { ...item.props, groupId } } as StudioItem) : item));
    }
  }

  // New connectors sit just under the new stickies; everything gets its own layer.
  const connectors = added.filter((item) => item.type === "connector");
  const others = added.filter((item) => item.type !== "connector");
  let layer = Math.max(0, ...items.map((item) => item.zIndex)) + 1;
  const layered = [...connectors, ...others].map((item) => ({ ...item, zIndex: layer++ }) as StudioItem);
  return { items: [...next, ...layered], addedIds: layered.map((item) => item.id) };
}

/** A change as the preview card says it. */
export function describeBoardChange(change: BoardChange, summary: BoardSummary): string {
  const name = (key: string) => {
    const text = summary.elements.find((element) => element.key === key)?.text ?? key;
    const first = text.split(/(?<=[.!?])\s|\n/)[0];
    return `“${first.length > 32 ? `${first.slice(0, 32).trimEnd()}…` : first}”`;
  };
  switch (change.kind) {
    case "add":
      return `Add “${change.node.title}”${change.to ? ` joined to ${name(change.to)}${change.label ? ` (${change.label})` : ""}` : ""}${change.children.length ? `, with ${change.children.map((child) => child.title).join(", ")}` : ""}${change.also.length ? `, linked to ${change.also.map((link) => `${name(link.to)}${link.label ? ` (${link.label})` : ""}`).join(" and ")}` : ""}`;
    case "connect":
      return `Connect ${name(change.from)} to ${name(change.to)}${change.label ? ` (${change.label})` : ""}`;
    case "tips":
      return `Add ${change.tips.length} exam tip${change.tips.length === 1 ? "" : "s"}: ${change.tips.join(" · ")}`;
    case "group":
      return `Group ${change.keys.map(name).join(", ")}`;
  }
}
