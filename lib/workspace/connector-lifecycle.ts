// ---------------------------------------------------------------------------
// Connector lifecycle helpers — deletion, copy/duplicate/paste remapping
// ---------------------------------------------------------------------------

import type { ConnectorEnd, ConnectorNode, StudioItem } from "@/types/workspace";

export function getConnectorBoundIds(connector: ConnectorNode): string[] {
  return [connector.props.source.id, connector.props.target.id].filter((id): id is string => Boolean(id));
}

/** True when any attached end refers to one of `ids` (used for cascade deletes). */
export function isConnectorAttachedToAny(item: StudioItem, ids: ReadonlySet<string>): boolean {
  return item.type === "connector" && getConnectorBoundIds(item).some((id) => ids.has(id));
}

/**
 * Drops connectors whose attached element no longer exists. Deletions that
 * filter the item list directly (eraser, asset removal) would otherwise leave
 * connectors that cannot render but are saved and reloaded forever. Returns
 * the same array when nothing is dropped.
 */
export function withoutOrphanConnectors<T extends StudioItem>(items: T[]): T[] {
  const ids = new Set(items.map((item) => item.id));
  const isOrphan = (item: StudioItem) =>
    item.type === "connector" && getConnectorBoundIds(item).some((id) => !ids.has(id));
  return items.some(isOrphan) ? items.filter((item) => !isOrphan(item)) : items;
}

/**
 * True when every attached end is inside `ids` and at least one end is
 * attached — the connector can travel with those nodes (AFFiNE
 * `isConnectorAndBindingsAllSelected`).
 */
export function connectorTravelsWith(item: StudioItem, ids: ReadonlySet<string>): item is ConnectorNode {
  if (item.type !== "connector") return false;
  const bound = getConnectorBoundIds(item);
  return bound.length > 0 && bound.every((id) => ids.has(id));
}

function remapEnd(end: ConnectorEnd, idMap: ReadonlyMap<string, string>, offset: { x: number; y: number }): ConnectorEnd | null {
  if (end.id) {
    const id = idMap.get(end.id);
    return id ? { ...end, id } : null;
  }
  return end.position ? { position: [end.position[0] + offset.x, end.position[1] + offset.y] } : null;
}

/**
 * Copy of a connector with attached ends remapped through `idMap` and free
 * ends shifted by `offset`. Returns null if an attached end is not in the map.
 */
export function remapConnector(
  connector: ConnectorNode,
  idMap: ReadonlyMap<string, string>,
  offset: { x: number; y: number },
  overrides: { id: string; zIndex: number },
): ConnectorNode | null {
  const source = remapEnd(connector.props.source, idMap, offset);
  const target = remapEnd(connector.props.target, idMap, offset);
  if (!source || !target) return null;
  return {
    ...connector,
    ...overrides,
    props: { ...JSON.parse(JSON.stringify(connector.props)), source, target },
  };
}

/**
 * Connectors that go along with a copy/duplicate/cut of `selectedIds`: those
 * attached to selected nodes only, plus directly selected connectors whose
 * attached ends (if any) are all selected (AFFiNE `isConnectorAndBindingsAllSelected`).
 */
export function connectorsForSelection(items: readonly StudioItem[], selectedIds: ReadonlySet<string>): ConnectorNode[] {
  return items.filter((item): item is ConnectorNode => {
    if (item.type !== "connector") return false;
    const bound = getConnectorBoundIds(item);
    if (selectedIds.has(item.id)) return bound.every((id) => selectedIds.has(id));
    return bound.length > 0 && bound.every((id) => selectedIds.has(id));
  });
}
