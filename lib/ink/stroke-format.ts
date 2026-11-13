// ---------------------------------------------------------------------------
// Ink stroke format, shared by every surface that stores pen strokes
// ---------------------------------------------------------------------------
//
// Points are in the owning item's local coordinates. Everything added after
// the first version is optional, so older strokes parse unchanged:
// - `t`: ms since the stroke's first sample (integer, never decreasing)
// - `startedAt`: epoch ms of the first sample
// - `pointerType`: the input that drew the stroke
//
// Re-exported by `types/workspace.ts`.

import { z } from "zod";

export const DrawingPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  pressure: z.number().finite().min(0).max(1).optional(),
  t: z.number().int().min(0).optional(),
});

export const StrokePointerTypeSchema = z.enum(["pen", "touch", "mouse"]);

export type DrawingPoint = z.infer<typeof DrawingPointSchema>;
export type StrokePointerType = z.infer<typeof StrokePointerTypeSchema>;

/** Stroke props beyond the rendered path, spread into a drawing's props schema. */
export const StrokeDataProps = {
  points: z.array(DrawingPointSchema).optional(),
  startedAt: z.number().int().optional(),
  pointerType: StrokePointerTypeSchema.optional(),
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toFinite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : Number.NaN);

/**
 * Repairs stored points: drops points without finite coordinates, clamps
 * pressure into 0..1, and keeps `t` only while it is a non-negative integer
 * that does not go backwards (a bad `t` is dropped, never the point).
 */
export function coerceStrokePoints(value: unknown): DrawingPoint[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const points: DrawingPoint[] = [];
  let lastT = -1;
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const x = toFinite(entry.x);
    const y = toFinite(entry.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const point: DrawingPoint = { x, y };
    if (typeof entry.pressure === "number" && Number.isFinite(entry.pressure)) {
      point.pressure = Math.max(0, Math.min(1, entry.pressure));
    }
    if (typeof entry.t === "number" && Number.isInteger(entry.t) && entry.t >= 0 && entry.t >= lastT) {
      point.t = entry.t;
      lastT = entry.t;
    }
    points.push(point);
  }
  return points.length > 0 ? points : undefined;
}

export function coerceStartedAt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

export function coerceStrokePointerType(value: unknown): StrokePointerType | undefined {
  const parsed = StrokePointerTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
