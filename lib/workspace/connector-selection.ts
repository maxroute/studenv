// ---------------------------------------------------------------------------
// Connector selection & editing helpers (AFFiNE parity)
// ---------------------------------------------------------------------------
// A connector's stored x/y/w/h is a placeholder; its real extent is its
// route. These helpers give selection, marquee, bounds and drag logic the
// route-based geometry AFFiNE uses.
// ---------------------------------------------------------------------------

import type { ConnectorEnd, ConnectorNode, StudioItem } from "@/types/workspace";
import { computeConnectorRoute } from "./connector-routing";
import { routeIncludesPoint, sampleRoute } from "./connector-path";
import { getConnectorBoundIds } from "./connector-lifecycle";
import type { Vec } from "./connector-anchors";
import { isElementLocked } from "./element-lock";

type Rect = { x: number; y: number; w: number; h: number };
type ItemLookup = readonly StudioItem[] | Map<string, StudioItem>;

export function getConnectorRoute(connector: ConnectorNode, items: ItemLookup) {
  const { mode, source, target } = connector.props;
  return computeConnectorRoute({ mode, source, target }, items);
}

/** Axis-aligned bounds of the connector's path (null when it cannot be routed). */
export function getConnectorBounds(connector: ConnectorNode, items: ItemLookup): Rect | null {
  const route = getConnectorRoute(connector, items);
  if (!route) return null;
  const points = sampleRoute(route);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** AFFiNE `containsBound`: a marquee selects a connector when any path point is inside it. */
export function connectorIntersectsRect(connector: ConnectorNode, items: ItemLookup, rect: Rect): boolean {
  const route = getConnectorRoute(connector, items);
  if (!route) return false;
  return sampleRoute(route).some((p) => p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h);
}

/** AFFiNE hit test: within 8 world units of the path plus half the stroke. */
export function connectorIncludesPoint(connector: ConnectorNode, items: ItemLookup, point: Vec): boolean {
  const route = getConnectorRoute(connector, items);
  return route ? routeIncludesPoint(route, point, connector.props.strokeWidth) : false;
}

/** Selection bounds of any item (connectors use their path). */
export function getItemSelectionBounds(item: StudioItem, items: ItemLookup): Rect | null {
  if (item.type === "connector") return getConnectorBounds(item, items);
  return { x: item.x, y: item.y, w: item.w, h: item.h };
}

/**
 * AFFiNE `ConnectorFilter`: a connector moves with a drag only when every
 * attached end's element is part of the dragged selection; otherwise it stays
 * (its attached ends follow their elements anyway).
 */
export function connectorMovesWithSelection(connector: ConnectorNode, selectedIds: ReadonlySet<string>): boolean {
  return getConnectorBoundIds(connector).every((id) => selectedIds.has(id));
}

/** Shift the free ends of a connector (attached ends are left to their elements). */
export function translateFreeEnds(props: ConnectorNode["props"], dx: number, dy: number): Pick<ConnectorNode["props"], "source" | "target"> {
  const shift = (end: ConnectorEnd): ConnectorEnd =>
    !end.id && end.position ? { position: [end.position[0] + dx, end.position[1] + dy] } : end;
  return { source: shift(props.source), target: shift(props.target) };
}

/** Topmost connector under a point (z-order), for programmatic hit tests. */
export function findConnectorAtPoint(items: readonly StudioItem[], point: Vec): ConnectorNode | null {
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const connectors = items
    .filter((item): item is ConnectorNode => item.type === "connector")
    .sort((a, b) => b.zIndex - a.zIndex);
  return connectors.find((connector) => connectorIncludesPoint(connector, byId, point)) ?? null;
}

// ── group moves ─────────────────────────────────────────────────────────

export type GroupMoveSnapshot = {
  positions: Map<string, { x: number; y: number }>;
  connectors: Map<string, ConnectorNode["props"]>;
};

/**
 * Snapshot of what a drag of `selectedIds` moves: unlocked items by position,
 * and unlocked connectors whose attached elements are all selected by their
 * free ends.
 * Connectors are never moved through their placeholder x/y.
 */
export function snapshotGroupMove(items: readonly StudioItem[], selectedIds: Iterable<string>): GroupMoveSnapshot {
  const selected = new Set(selectedIds);
  const positions = new Map<string, { x: number; y: number }>();
  const connectors = new Map<string, ConnectorNode["props"]>();
  for (const item of items) {
    if (!selected.has(item.id)) continue;
    if (item.type === "connector") {
      if (!isElementLocked(item) && connectorMovesWithSelection(item, selected)) connectors.set(item.id, item.props);
    } else if (!("locked" in item.props && item.props.locked)) {
      positions.set(item.id, { x: item.x, y: item.y });
    }
  }
  return { positions, connectors };
}

/** Batch updates moving a snapshot by (dx, dy). */
export function groupMoveUpdates(snapshot: GroupMoveSnapshot, dx: number, dy: number) {
  return [
    ...[...snapshot.positions].map(([id, start]) => ({ id, changes: { x: start.x + dx, y: start.y + dy } })),
    ...[...snapshot.connectors].map(([id, props]) => ({ id, changes: {}, props: translateFreeEnds(props, dx, dy) })),
  ];
}
