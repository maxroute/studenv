export type StrokePoint = { x: number; y: number; pressure?: number };
export type Point = { x: number; y: number };

/** Build a pressure-aware filled outline. Pressure is optional so mouse-only
 * devices and older saved strokes retain a predictable constant-width feel. */
export function createStrokeOutline(points: StrokePoint[], baseWidth: number): Point[] {
  if (!points.length) return [];
  const width = Math.max(0.5, Number.isFinite(baseWidth) ? baseWidth : 3);
  const sampled: StrokePoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const previous = sampled[sampled.length - 1];
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.15) {
      sampled[sampled.length - 1] = point;
    } else sampled.push(point);
  }
  if (!sampled.length) return [];
  if (sampled.length === 1) {
    const radius = width * (0.18 + 0.82 * pressureOf(sampled[0])) / 2;
    return Array.from({ length: 16 }, (_, i) => ({
      x: sampled[0].x + Math.cos((i / 16) * Math.PI * 2) * radius,
      y: sampled[0].y + Math.sin((i / 16) * Math.PI * 2) * radius,
    }));
  }

  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < sampled.length; i++) {
    const before = sampled[Math.max(0, i - 1)];
    const after = sampled[Math.min(sampled.length - 1, i + 1)];
    let dx = after.x - before.x;
    let dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length; dy /= length;
    const pressure = pressureOf(sampled[i]);
    const radius = Math.max(0.35, width * (0.18 + pressure * 0.82) / 2);
    left.push({ x: sampled[i].x - dy * radius, y: sampled[i].y + dx * radius });
    right.push({ x: sampled[i].x + dy * radius, y: sampled[i].y - dx * radius });
  }
  return [...left, ...right.reverse()];
}

function pressureOf(point: StrokePoint) {
  return Math.max(0.08, Math.min(1, Number.isFinite(point.pressure) ? point.pressure! : 0.5));
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
    return x1*x2<=0 && x3*x4<=0;
  })();
  if (intersects) return 0;
  return Math.min(pointDistance(a,closest(a,c,d)),pointDistance(b,closest(b,c,d)),
    pointDistance(c,closest(c,a,b)),pointDistance(d,closest(d,a,b)));
}

/** Hit-test the actual stroke centerline, including its visible half-width. */
export function strokeIntersectsPolyline(
  stroke: StrokePoint[], eraser: Point[], eraserRadius: number, strokeWidth: number,
) {
  if (!stroke.length || !eraser.length) return false;
  const radius = Math.max(0, eraserRadius) + Math.max(0, strokeWidth) / 2;
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
