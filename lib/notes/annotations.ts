// ---------------------------------------------------------------------------
// Ink on a pinned PDF page (the `pdfPage` block)
// ---------------------------------------------------------------------------
//
// A stroke is stored relative to the page: x and y from 0 to 1 of the page's
// width and height, and `size` as a fraction of the width, so the same ink
// lines up at any card size. `points` is flat: x, y, pressure, x, y, … Pure;
// the save path coerces every stroke through `coerceStrokes`.

export type NoteStrokeTool = "pen" | "highlighter";

export type NoteStroke = {
  tool: NoteStrokeTool;
  color: string;
  size: number;
  points: number[];
};

export const MAX_STROKES_PER_PAGE = 400;
export const MAX_POINTS_PER_STROKE = 1500;

const COLOR = /^(?:#[0-9a-fA-F]{6}|var\(--note-color-[a-z0-9-]{1,32}\))$/;

const round = (value: number) => Math.round(value * 10_000) / 10_000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** One stroke made safe to store and render, or null when nothing usable is left. */
export function coerceStroke(value: unknown): NoteStroke | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const tool: NoteStrokeTool = raw.tool === "highlighter" ? "highlighter" : "pen";
  const color = typeof raw.color === "string" && COLOR.test(raw.color) ? raw.color : tool === "highlighter" ? "#f5d76e" : "#e05a4b";
  const size = typeof raw.size === "number" && Number.isFinite(raw.size) ? clamp(raw.size, 0.001, 0.08) : 0.004;
  if (!Array.isArray(raw.points)) return null;
  const points: number[] = [];
  const limit = Math.min(raw.points.length - (raw.points.length % 3), MAX_POINTS_PER_STROKE * 3);
  for (let index = 0; index < limit; index += 3) {
    const [x, y, pressure] = raw.points.slice(index, index + 3);
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const p = typeof pressure === "number" && Number.isFinite(pressure) ? clamp(pressure, 0, 1) : 0.5;
    points.push(round(clamp(x, -0.05, 1.05)), round(clamp(y, -0.05, 1.05)), round(p));
  }
  return points.length >= 3 ? { tool, color, size: round(size), points } : null;
}

export function coerceStrokes(value: unknown): NoteStroke[] {
  if (!Array.isArray(value)) return [];
  const strokes: NoteStroke[] = [];
  for (const entry of value.slice(0, MAX_STROKES_PER_PAGE)) {
    const stroke = coerceStroke(entry);
    if (stroke) strokes.push(stroke);
  }
  return strokes;
}

/** Point triples of a stroke, scaled to a box of `width` × `height` pixels. */
export function strokeToPixels(stroke: NoteStroke, width: number, height: number) {
  const points: Array<{ x: number; y: number; pressure: number }> = [];
  for (let index = 0; index + 2 < stroke.points.length; index += 3) {
    points.push({ x: stroke.points[index] * width, y: stroke.points[index + 1] * height, pressure: stroke.points[index + 2] });
  }
  return points;
}

/** True when the pixel point is within `radius` of any segment of the stroke (for the eraser). */
export function strokeHitsPoint(stroke: NoteStroke, width: number, height: number, x: number, y: number, radius: number): boolean {
  const points = strokeToPixels(stroke, width, height);
  const reach = radius + (stroke.size * width) / 2;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[index + 1] ?? a;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : clamp(((x - a.x) * dx + (y - a.y) * dy) / lengthSquared, 0, 1);
    const distance = Math.hypot(a.x + t * dx - x, a.y + t * dy - y);
    if (distance <= reach) return true;
  }
  return false;
}
