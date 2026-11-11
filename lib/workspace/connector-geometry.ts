import type { ConnectorAnchor, StudioItem } from "@/types/workspace";

export type ConnectorPoint = { x: number; y: number };
export type ConnectorAnchorName = ConnectorAnchor;

const ANCHORS: ConnectorAnchorName[] = ["top", "right", "bottom", "left"];

export function isConnectableWorkspaceItem(item: StudioItem): boolean {
  if (item.type === "connector" || item.type === "group" || item.type === "drawing") return false;
  if (item.type === "shape" && (item.props.kind === "line" || item.props.kind === "arrow")) return false;
  return !("locked" in item.props && item.props.locked === true);
}

export function getConnectorAnchorPoint(
  item: Exclude<StudioItem, { type: "connector" }>,
  anchor: ConnectorAnchorName,
): ConnectorPoint {
  const local: Record<ConnectorAnchorName, ConnectorPoint> = {
    top: { x: item.x + item.w / 2, y: item.y },
    right: { x: item.x + item.w, y: item.y + item.h / 2 },
    bottom: { x: item.x + item.w / 2, y: item.y + item.h },
    left: { x: item.x, y: item.y + item.h / 2 },
  };
  const point = local[anchor];
  const radians = ((item.rotation ?? 0) * Math.PI) / 180;
  if (!radians) return point;

  const center = { x: item.x + item.w / 2, y: item.y + item.h / 2 };
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

export function getNearestConnectorAnchor(
  item: Exclude<StudioItem, { type: "connector" }>,
  point: ConnectorPoint,
) {
  let nearest: { anchor: ConnectorAnchorName; point: ConnectorPoint; distance: number } | null = null;
  for (const anchor of ANCHORS) {
    const anchorPoint = getConnectorAnchorPoint(item, anchor);
    const distance = Math.hypot(anchorPoint.x - point.x, anchorPoint.y - point.y);
    if (!nearest || distance < nearest.distance) {
      nearest = { anchor, point: anchorPoint, distance };
    }
  }
  return nearest!;
}

export function getConnectorPath(source: ConnectorPoint, target: ConnectorPoint): string {
  return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
}

export function getConnectorArrowHead(source: ConnectorPoint, target: ConnectorPoint, size = 9): string {
  const angle = Math.atan2(target.y - source.y, target.x - source.x);
  const backX = target.x - Math.cos(angle) * size;
  const backY = target.y - Math.sin(angle) * size;
  const wing = size * 0.55;
  const left = {
    x: backX + Math.cos(angle + Math.PI / 2) * wing,
    y: backY + Math.sin(angle + Math.PI / 2) * wing,
  };
  const right = {
    x: backX + Math.cos(angle - Math.PI / 2) * wing,
    y: backY + Math.sin(angle - Math.PI / 2) * wing,
  };
  return `M ${target.x} ${target.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`;
}
