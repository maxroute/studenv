import { getStroke } from "perfect-freehand";

export type StrokePoint = { x: number; y: number; pressure?: number };
export type Point = { x: number; y: number };

/** Resample a stroke without inventing pressure values for missing samples. */
export function resampleStrokePoints(points: StrokePoint[], maxStep = 2): StrokePoint[] {
  if (points.length <= 1) return points;
  const sampled: StrokePoint[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1];
    const end = points[i];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) continue;
    const segments = Math.max(1, Math.ceil(distance / Math.max(0.25, maxStep)));
    for (let step = 1; step <= segments; step += 1) {
      const t = step / segments;
      sampled.push({
        x: start.x + dx * t,
        y: start.y + dy * t,
        ...(typeof start.pressure === "number" && typeof end.pressure === "number"
          ? { pressure: start.pressure + (end.pressure - start.pressure) * t }
          : step === segments && typeof end.pressure === "number"
            ? { pressure: end.pressure }
            : {}),
      });
    }
  }
  return sampled;
}

/** Build a pressure-aware filled outline. Pressure is optional so mouse-only
 * devices and older saved strokes retain a predictable constant-width feel. */
export function createStrokeOutline(points: StrokePoint[], baseWidth: number): Point[] {
  if (!points.length) return [];
  const validPoints = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const hasMeasuredPressure = validPoints.some(
    (point) => typeof point.pressure === "number" && Number.isFinite(point.pressure),
  );

  // Pointer-up events commonly report pressure=0 (pen lifted), even though
  // the last coalesced move sample contains the real pen pressure. Once a
  // stroke has measured pressure, fill missing samples from the nearest
  // measured sample instead of switching the whole stroke to simulated
  // pressure during finalization.
  const input = validPoints.map((point, index) => {
    let pressure = point.pressure;
    if (hasMeasuredPressure && (pressure === undefined || !Number.isFinite(pressure))) {
      let before: number | undefined;
      let after: number | undefined;
      for (let i = index - 1; i >= 0 && before === undefined; i -= 1) {
        const candidate = validPoints[i].pressure;
        if (typeof candidate === "number" && Number.isFinite(candidate)) before = candidate;
      }
      for (let i = index + 1; i < validPoints.length && after === undefined; i += 1) {
        const candidate = validPoints[i].pressure;
        if (typeof candidate === "number" && Number.isFinite(candidate)) after = candidate;
      }
      pressure = before === undefined ? after : after === undefined ? before : (before + after) / 2;
    }
    return {
      x: point.x,
      y: point.y,
      ...(typeof pressure === "number" && Number.isFinite(pressure)
        ? { pressure: Math.max(0.08, Math.min(1, pressure)) }
        : {}),
    };
  });
  if (!input.length) return [];
  const outline = getStroke(input, {
    size: Math.max(0.5, Number.isFinite(baseWidth) ? baseWidth : 3),
    thinning: 0.65,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: input.some((point) => point.pressure === undefined),
    last: true,
  });
  return outline.map(([x, y]) => ({ x, y }));
}


/** Smooth closed polygon path using quadratic midpoint interpolation. */
export function outlineToPath(points: Point[]): string {
  if (points.length < 3) return "";
  const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const firstMid = mid(points[points.length - 1], points[0]);
  let d = `M ${firstMid.x} ${firstMid.y}`;
  for (let i = 0; i < points.length; i++) {
    const nextMid = mid(points[i], points[(i + 1) % points.length]);
    d += ` Q ${points[i].x} ${points[i].y} ${nextMid.x} ${nextMid.y}`;
  }
  return d + " Z";
}

export function getStrokeBounds(points: Point[]) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

function segmentDistanceSquared(a: Point, b: Point, c: Point, d: Point) {
  const pointDistance = (p: Point, q: Point) => (p.x-q.x)**2 + (p.y-q.y)**2;
  const closest = (p: Point, v: Point, w: Point) => {
    const dx=w.x-v.x, dy=w.y-v.y, length=dx*dx+dy*dy;
    const t=length ? Math.max(0,Math.min(1,((p.x-v.x)*dx+(p.y-v.y)*dy)/length)) : 0;
    return {x:v.x+t*dx,y:v.y+t*dy};
  };
  const intersects = (() => {
    const cross=(p:Point,q:Point,r:Point)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
    const x1=cross(a,b,c),x2=cross(a,b,d),x3=cross(c,d,a),x4=cross(c,d,b);
    const within = (p: Point, q: Point, r: Point) =>
      q.x >= Math.min(p.x,r.x) - 1e-9 && q.x <= Math.max(p.x,r.x) + 1e-9 &&
      q.y >= Math.min(p.y,r.y) - 1e-9 && q.y <= Math.max(p.y,r.y) + 1e-9;
    if (x1*x2 < 0 && x3*x4 < 0) return true;
    return (Math.abs(x1)<1e-9 && within(a,c,b)) || (Math.abs(x2)<1e-9 && within(a,d,b)) ||
      (Math.abs(x3)<1e-9 && within(c,a,d)) || (Math.abs(x4)<1e-9 && within(c,b,d));
  })();
  if (intersects) return 0;
  return Math.min(pointDistance(a,closest(a,c,d)),pointDistance(b,closest(b,c,d)),
    pointDistance(c,closest(c,a,b)),pointDistance(d,closest(d,a,b)));
}

/** Hit-test the rendered pressure-aware stroke polygon against a swept eraser. */
export function strokeOutlineIntersectsPolyline(outline: Point[], eraser: Point[], eraserRadius: number) {
  if (outline.length < 3 || eraser.length === 0) return false;
  const radius = Math.max(0, eraserRadius);
  const limit = radius * radius;
  const strokeBounds = getStrokeBounds(outline);
  const eraserBounds = getStrokeBounds(eraser);
  if (
    eraserBounds.maxX + radius < strokeBounds.minX ||
    eraserBounds.minX - radius > strokeBounds.maxX ||
    eraserBounds.maxY + radius < strokeBounds.minY ||
    eraserBounds.minY - radius > strokeBounds.maxY
  ) return false;

  const containsPoint = (point: Point) => {
    let inside = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const a = outline[i], b = outline[j];
      const crosses = (a.y > point.y) !== (b.y > point.y) &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (crosses) inside = !inside;
    }
    return inside;
  };

  const edgeCount = outline.length;
  for (let i = 0; i < eraser.length; i++) {
    const point = eraser[i];
    if (containsPoint(point)) return true;
    const previous = eraser[Math.max(0, i - 1)];
    for (let edge = 0; edge < edgeCount; edge++) {
      const a = outline[edge];
      const b = outline[(edge + 1) % edgeCount];
      if (segmentDistanceSquared(previous, point, a, b) <= limit) return true;
    }
  }
  return false;
}

/** Hit-test the actual stroke centerline, including its visible half-width. */
export function strokeIntersectsPolyline(
  stroke: StrokePoint[], eraser: Point[], eraserRadius: number, strokeWidth: number,
) {
  if (!stroke.length || !eraser.length) return false;
  // Give the eraser a forgiving hit area while still respecting the visible stroke width.
  // This compensates for pressure-shaped outlines and makes near-edge passes reliable.
  const radius = Math.max(0, eraserRadius) * 1.35 + Math.max(0, strokeWidth) / 2;
  const limit = radius * radius;
  if (stroke.length === 1) {
    return eraser.some((p) => (p.x-stroke[0].x)**2+(p.y-stroke[0].y)**2 <= limit);
  }
  for (let i=1;i<stroke.length;i++) {
    for (let j=0;j<Math.max(1,eraser.length);j++) {
      const a=eraser[Math.max(0,j-1)], b=eraser[j];
      if (segmentDistanceSquared(stroke[i-1],stroke[i],a,b)<=limit) return true;
    }
  }
  return false;
}
