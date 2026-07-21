// ---------------------------------------------------------------------------
// Shape Tool – Core type definitions
// ---------------------------------------------------------------------------

export const SHAPE_KINDS = [
  "rectangle",
  "rounded-rectangle",
  "circle",
  "ellipse",
  "triangle",
  "diamond",
  "hexagon",
  "pentagon",
  "star",
  "arrow",
  "line",
] as const;

export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** Visual fill style for a shape */
export interface ShapeFill {
  type: "solid" | "transparent";
  color: string;
}

/** Stroke/border style for a shape */
export interface ShapeStroke {
  width: number;
  color: string;
  style: "solid" | "dashed" | "dotted";
}

/** Complete visual styling for a shape node */
export interface ShapeStyle {
  fill: ShapeFill;
  stroke: ShapeStroke;
  cornerRadius: number;
  opacity: number; // 0–100
  shadow: boolean;
  locked: boolean;
  groupId?: string;
}

/** Human-readable labels for the toolbar */
export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rectangle: "Rectangle",
  "rounded-rectangle": "Rounded Rectangle",
  circle: "Circle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  diamond: "Diamond",
  hexagon: "Hexagon",
  pentagon: "Pentagon",
  star: "Star",
  arrow: "Arrow",
  line: "Line",
};

/** Default visual style applied when creating a new shape */
export function getDefaultShapeStyle(kind: ShapeKind): ShapeStyle {
  const isLine = kind === "line" || kind === "arrow";

  return {
    fill: {
      type: isLine ? "transparent" : "solid",
      color: isLine ? "transparent" : "#e0e7ff", // indigo-100
    },
    stroke: {
      width: 2,
      color: "#6366f1", // indigo-500  (matches app accent)
      style: "solid",
    },
    cornerRadius: kind === "rounded-rectangle" ? 12 : 0,
    opacity: 100,
    shadow: false,
    locked: false,
  };
}
