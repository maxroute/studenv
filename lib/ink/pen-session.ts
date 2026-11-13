// ---------------------------------------------------------------------------
// Pen sampling: pointer samples in, stroke points out
// ---------------------------------------------------------------------------
//
// Pure, so every host (the workspace canvas today, a note ink block later)
// samples strokes the same way. The host's DOM adapter converts each event,
// including every coalesced event, into a `PenSample` in its own coordinates.
// Cancelling a stroke when a second finger lands is the host's gesture logic
// (`lib/workspace/pointer-session.ts`).

import { coerceStrokePointerType, type DrawingPoint, type StrokePointerType } from "./stroke-format";

export type PenSample = {
  x: number;
  y: number;
  /** `PointerEvent.pressure`. */
  pressure: number;
  /** `PointerEvent.pointerType`. */
  pointerType: string;
  /** `PointerEvent.timeStamp`, ms on the page's clock. */
  timeStamp: number;
};

/** Fixed when the stroke starts. */
export type StrokeClock = {
  firstTimeStamp: number;
  /** Epoch ms of the first sample. */
  startedAt: number;
  pointerType: StrokePointerType | undefined;
};

/**
 * Mice report a constant pressure and many browsers report 0 when nothing is
 * known, so only real positive pressure from pens and touch is kept.
 */
export function samplePressure(pointerType: string, pressure: number): number | undefined {
  return pointerType === "mouse" || !(pressure > 0) ? undefined : Math.min(1, pressure);
}

function toPoint(sample: PenSample, clock: StrokeClock, minT: number): DrawingPoint {
  const pressure = samplePressure(sample.pointerType, sample.pressure);
  // Coalesced events can share or, rarely, reorder timestamps; t never goes back.
  const t = Math.max(minT, Math.round(sample.timeStamp - clock.firstTimeStamp));
  return { x: sample.x, y: sample.y, ...(pressure === undefined ? {} : { pressure }), t };
}

/** `startedAt` is the first sample's time in epoch ms (`performance.timeOrigin + timeStamp`). */
export function beginStroke(sample: PenSample, startedAt: number): { clock: StrokeClock; point: DrawingPoint } {
  const clock: StrokeClock = {
    firstTimeStamp: sample.timeStamp,
    startedAt: Math.round(startedAt),
    pointerType: coerceStrokePointerType(sample.pointerType),
  };
  return { clock, point: toPoint(sample, clock, 0) };
}

/** Points for a move event's samples (all its coalesced events, oldest first). */
export function samplesToPoints(samples: readonly PenSample[], clock: StrokeClock, previous?: DrawingPoint): DrawingPoint[] {
  let minT = previous?.t ?? 0;
  return samples.map((sample) => {
    const point = toPoint(sample, clock, minT);
    minT = point.t ?? minT;
    return point;
  });
}

/**
 * The finished stroke for pointer-up. Pen-up often reports zero pressure, so
 * the last real pressure is kept and the saved stroke matches the live
 * preview. The up position is added only when the pointer moved since the
 * last sample.
 */
export function finishStroke(points: readonly DrawingPoint[], up: PenSample, clock: StrokeClock): DrawingPoint[] {
  if (points.length === 0) return [];
  const last = points[points.length - 1];
  if (last.x === up.x && last.y === up.y) return [...points];

  const [upPoint] = samplesToPoints([up], clock, last);
  const pressure = up.pointerType === "mouse" ? undefined : samplePressure(up.pointerType, up.pressure) ?? last.pressure;
  const { pressure: _ignored, ...rest } = upPoint;
  return [...points, pressure === undefined ? rest : { ...rest, pressure }];
}
