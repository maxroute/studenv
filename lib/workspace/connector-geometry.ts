import type { StudioItem } from "@/types/workspace";

export type ConnectorAnchor = "top" | "right" | "bottom" | "left";
export type Point = { x: number; y: number };

const ANCHOR_VECTOR: Record<ConnectorAnchor, Point> = {
  top: { x: 0.5, y: 0 },
  right: { x: 1, y: 0.5 },
  bottom: { x: 0.5, y: 1 },
  left: { x: 0, y: 0.5 },
};

export function getConnectorAnchorPoint(
  item: Pick<StudioItem, "x" | "y" | "w" | "h" | "rotation">,
  anchor: ConnectorAnchor,
): Point {
  const vector = ANCHOR_VECTOR[anchor];
  const localX = (vector.x - 0.5) * item.w;
  const localY = (vector.y - 0.5) * item.h;
  const radians = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: item.x + item.w / 2 + localX * cos - localY * sin,
    y: item.y + item.h / 2 + localX * sin + localY * cos,
  };
}

export function getNearestConnectorAnchor(
  item: Pick<StudioItem, "x" | "y" | "w" | "h" | "rotation">,
  point: Point,
): { anchor: ConnectorAnchor; point: Point; distance: number } {
  const anchors = (Object.keys(ANCHOR_VECTOR) as ConnectorAnchor[]).map((anchor) => {
    const anchorPoint = getConnectorAnchorPoint(item, anchor);
    return {
      anchor,
      point: anchorPoint,
      distance: Math.hypot(anchorPoint.x - point.x, anchorPoint.y - point.y),
    };
  });
  return anchors.reduce((nearest, current) =>
    current.distance < nearest.distance ? current : nearest
  );
}

export function getConnectorPath(source: Point, target: Point): string {
  return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
}

export function isConnectableWorkspaceItem(item: StudioItem): boolean {
  if (item.type === "group" || item.type === "drawing") return false;
  if (item.type === "shape" && (item.props.kind === "line" || item.props.kind === "arrow")) return false;
  if (item.type === "shape" && item.props.locked) return false;
  return true;
}
