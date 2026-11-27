// ---------------------------------------------------------------------------
// Text inside shapes: where it fits, and a colour that reads on the fill
// ---------------------------------------------------------------------------
//
// Pure: no React or DOM. The text lives in the shape's own props, so it moves,
// resizes and rotates with the shape and needs no group.

/** Lines and arrows are strokes, not containers. */
export function shapeHoldsText(kind: string): boolean {
  return kind !== "line" && kind !== "arrow";
}

/**
 * The share of the width and height, on each side, kept clear so text sits
 * inside the drawn outline: pointed shapes have little room at their edges.
 */
const INSET: Record<string, { x: number; top: number; bottom: number }> = {
  rectangle: { x: 0.06, top: 0.08, bottom: 0.08 },
  "rounded-rectangle": { x: 0.08, top: 0.1, bottom: 0.1 },
  circle: { x: 0.15, top: 0.15, bottom: 0.15 },
  ellipse: { x: 0.15, top: 0.15, bottom: 0.15 },
  diamond: { x: 0.25, top: 0.25, bottom: 0.25 },
  hexagon: { x: 0.2, top: 0.12, bottom: 0.12 },
  pentagon: { x: 0.18, top: 0.3, bottom: 0.1 },
  triangle: { x: 0.28, top: 0.45, bottom: 0.08 },
  star: { x: 0.32, top: 0.38, bottom: 0.25 },
};

/** The box, in the shape's own pixels, that its text is laid out in. */
export function shapeTextBox(kind: string, w: number, h: number): { left: number; top: number; width: number; height: number } {
  const inset = INSET[kind] ?? INSET.rectangle;
  const left = Math.round(w * inset.x);
  const top = Math.round(h * inset.top);
  return { left, top, width: Math.max(1, Math.round(w - 2 * left)), height: Math.max(1, Math.round(h - top - h * inset.bottom)) };
}

function luminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const full = match[1].length === 3 ? match[1].split("").map((c) => c + c).join("") : match[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The text colour: the one chosen, else dark on a light fill and white on a dark one. */
export function shapeTextColor(fill: { type: string; color: string }, chosen?: string): string {
  if (chosen) return chosen;
  if (fill.type === "transparent") return "#1e1e1e";
  const light = luminance(fill.color);
  return light !== null && light < 0.3 ? "#ffffff" : "#1e1e1e";
}
