"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { ConnectorNode, StudioItem } from "@/types/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import { useConnectorUiStore } from "@/lib/workspace/connector-ui-store";
import { findConnectionTarget, type ConnectionTarget } from "@/lib/workspace/connector-target";
import { getConnectorRoute, groupMoveUpdates, snapshotGroupMove, type GroupMoveSnapshot } from "@/lib/workspace/connector-selection";
import { getPointAtOffset } from "@/lib/workspace/connector-path";
import { getLabelOffsetAtPoint } from "@/lib/workspace/connector-label";
import type { Vec } from "@/lib/workspace/connector-anchors";
import { groupSelection, isElementLocked } from "@/lib/workspace/element-lock";
import { ConnectionOverlay, CONNECTION_EMPHASIS_COLOR } from "../ConnectionOverlay";

type EndName = "source" | "target";

type BodyDrag = {
  pointerId: number;
  startWorld: Vec;
  startClient: Vec;
  moving: boolean;
  /** Everything that moves: items by position, connectors by free ends. */
  snapshot: GroupMoveSnapshot;
};

type EndDrag = {
  pointerId: number;
  connectorId: string;
  end: EndName;
  original: ConnectorNode["props"];
  target: ConnectionTarget | null;
};

type LabelDrag = {
  pointerId: number;
  connectorId: string;
  startClient: Vec;
  /** Pointer position relative to the label centre, kept while sliding. */
  grab: Vec;
  original: NonNullable<ConnectorNode["props"]["label"]>;
  moving: boolean;
};

/** Screen pixels a press must travel before it becomes a drag. */
const BODY_DRAG_THRESHOLD_PX = 3;
/** AFFiNE connector endpoint handle (screen px). */
const ENDPOINT_HANDLE_PX = 12;
const ENDPOINT_HIT_PX = 24;

/**
 * Selecting and editing existing connectors (AFFiNE parity): click to
 * select, drag a selection that includes free connectors, and drag a
 * selected connector's endpoint handles to reattach or detach them.
 */
export function ConnectorEditingLayer({
  items,
  selectedIds,
  enabled,
  zoom,
  screenToWorld,
}: {
  items: StudioItem[];
  selectedIds: string[];
  /** Select tool active. */
  enabled: boolean;
  zoom: number;
  screenToWorld: (clientX: number, clientY: number) => Vec;
}) {
  const batchUpdateItems = useWorkspaceStore((state) => state.batchUpdateItems);
  const setConnectorPointerDown = useConnectorUiStore((state) => state.setConnectorPointerDown);
  const setConnectorDoubleClick = useConnectorUiStore((state) => state.setConnectorDoubleClick);
  const setEditingLabel = useConnectorUiStore((state) => state.setEditingLabel);
  const [endDrag, setEndDrag] = useState<EndDrag | null>(null);
  const bodyDragRef = useRef<BodyDrag | null>(null);
  const labelDragRef = useRef<LabelDrag | null>(null);
  const endDragRef = useRef<EndDrag | null>(null);
  const live = useRef({ items, zoom, screenToWorld });
  live.current = { items, zoom, screenToWorld };

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item] as const)), [items]);

  // ── pressing a connector path or label ─────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      setConnectorPointerDown(null);
      setConnectorDoubleClick(null);
      return;
    }
    setConnectorPointerDown((connectorId, event, part) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const selection = useSelectionStore.getState();
      if (event.shiftKey) {
        selection.toggle(connectorId);
        return;
      }

      // Pressing the label of the selected connector slides it along the path (AFFiNE).
      const connector = live.current.items.find((item): item is ConnectorNode => item.id === connectorId && item.type === "connector");
      const label = connector?.props.label;
      if (part === "label" && connector && label && !isElementLocked(connector) && selection.selectedIds.length === 1 && selection.selectedIds[0] === connectorId) {
        const route = getConnectorRoute(connector, live.current.items);
        if (!route) return;
        const world = live.current.screenToWorld(event.clientX, event.clientY);
        const center = getPointAtOffset(route, label.offset);
        labelDragRef.current = {
          pointerId: event.pointerId,
          connectorId,
          startClient: { x: event.clientX, y: event.clientY },
          grab: { x: world.x - center.x, y: world.y - center.y },
          original: label,
          moving: false,
        };
        return;
      }

      // A grouped connector selects its whole group, like any other element.
      if (!selection.selectedIds.includes(connectorId)) {
        selection.clearAndSelectIds(groupSelection(connectorId, live.current.items));
      }

      const snapshot = snapshotGroupMove(live.current.items, useSelectionStore.getState().selectedIds);
      bodyDragRef.current = {
        pointerId: event.pointerId,
        startWorld: live.current.screenToWorld(event.clientX, event.clientY),
        startClient: { x: event.clientX, y: event.clientY },
        moving: false,
        snapshot,
      };
    });
    setConnectorDoubleClick((connectorId, event) => {
      const connector = live.current.items.find((item): item is ConnectorNode => item.id === connectorId && item.type === "connector");
      if (!connector) return;
      const route = getConnectorRoute(connector, live.current.items);
      if (!route) return;
      event.preventDefault();
      event.stopPropagation();
      bodyDragRef.current = null;
      labelDragRef.current = null;
      useSelectionStore.getState().select(connectorId);
      if (isElementLocked(connector)) return;
      // An existing label is edited where it is; otherwise the new label
      // starts at the clicked point projected onto the path.
      const offset = connector.props.label?.offset ?? getLabelOffsetAtPoint(route, live.current.screenToWorld(event.clientX, event.clientY));
      setEditingLabel({ connectorId, offset });
    });
    return () => {
      setConnectorPointerDown(null);
      setConnectorDoubleClick(null);
    };
  }, [enabled, setConnectorPointerDown, setConnectorDoubleClick, setEditingLabel]);

  // ── window listeners for body and endpoint drags ───────────────────────
  useEffect(() => {
    const restoreEnd = () => {
      const drag = endDragRef.current;
      if (!drag) return;
      batchUpdateItems([{ id: drag.connectorId, changes: {}, props: { [drag.end]: drag.original[drag.end] } }]);
    };

    const restoreLabel = (drag: LabelDrag) => {
      batchUpdateItems([{ id: drag.connectorId, changes: {}, props: { label: drag.original } }]);
    };

    const handleMove = (event: PointerEvent) => {
      const labelDrag = labelDragRef.current;
      if (labelDrag && labelDrag.pointerId === event.pointerId) {
        if (!labelDrag.moving) {
          const travelled = Math.hypot(event.clientX - labelDrag.startClient.x, event.clientY - labelDrag.startClient.y);
          if (travelled < BODY_DRAG_THRESHOLD_PX) return;
          labelDrag.moving = true;
        }
        const connector = live.current.items.find((item): item is ConnectorNode => item.id === labelDrag.connectorId && item.type === "connector");
        const route = connector ? getConnectorRoute(connector, live.current.items) : null;
        if (!route) return;
        const world = live.current.screenToWorld(event.clientX, event.clientY);
        const offset = getLabelOffsetAtPoint(route, { x: world.x - labelDrag.grab.x, y: world.y - labelDrag.grab.y });
        batchUpdateItems([{ id: labelDrag.connectorId, changes: {}, props: { label: { ...labelDrag.original, offset } } }]);
        event.preventDefault();
        return;
      }

      const body = bodyDragRef.current;
      if (body && body.pointerId === event.pointerId) {
        if (!body.moving) {
          const travelled = Math.hypot(event.clientX - body.startClient.x, event.clientY - body.startClient.y);
          if (travelled < BODY_DRAG_THRESHOLD_PX) return;
          if (body.snapshot.positions.size === 0 && body.snapshot.connectors.size === 0) return;
          body.moving = true;
          useSelectionStore.getState().setDraggingIds([...body.snapshot.positions.keys(), ...body.snapshot.connectors.keys()]);
        }
        const world = live.current.screenToWorld(event.clientX, event.clientY);
        const dx = world.x - body.startWorld.x;
        const dy = world.y - body.startWorld.y;
        batchUpdateItems(groupMoveUpdates(body.snapshot, dx, dy));
        event.preventDefault();
        return;
      }

      const drag = endDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const world = live.current.screenToWorld(event.clientX, event.clientY);
      const other = drag.original[drag.end === "source" ? "target" : "source"];
      const target = findConnectionTarget(world, live.current.items, { zoom: live.current.zoom, excludeIds: other.id ? [other.id] : [] });
      batchUpdateItems([{ id: drag.connectorId, changes: {}, props: { [drag.end]: target.end } }]);
      const next = { ...drag, target };
      endDragRef.current = next;
      setEndDrag(next);
      event.preventDefault();
    };

    const finish = (event: PointerEvent) => {
      if (labelDragRef.current?.pointerId === event.pointerId) {
        labelDragRef.current = null;
        return;
      }
      const body = bodyDragRef.current;
      if (body && body.pointerId === event.pointerId) {
        bodyDragRef.current = null;
        if (body.moving) useSelectionStore.getState().setDraggingIds([]);
        return;
      }
      if (endDragRef.current?.pointerId === event.pointerId) {
        endDragRef.current = null;
        setEndDrag(null);
      }
    };

    const cancel = (event: PointerEvent) => {
      const labelDrag = labelDragRef.current;
      if (labelDrag && labelDrag.pointerId === event.pointerId) {
        restoreLabel(labelDrag);
        labelDragRef.current = null;
        return;
      }
      const body = bodyDragRef.current;
      if (body && body.pointerId === event.pointerId) {
        // Put everything back where the drag started.
        batchUpdateItems(groupMoveUpdates(body.snapshot, 0, 0));
        bodyDragRef.current = null;
        if (body.moving) useSelectionStore.getState().setDraggingIds([]);
        return;
      }
      if (endDragRef.current?.pointerId === event.pointerId) {
        restoreEnd();
        endDragRef.current = null;
        setEndDrag(null);
      }
    };

    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const labelDrag = labelDragRef.current;
      if (labelDrag) {
        event.preventDefault();
        event.stopPropagation();
        if (labelDrag.moving) restoreLabel(labelDrag);
        labelDragRef.current = null;
        return;
      }
      if (!endDragRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      restoreEnd();
      endDragRef.current = null;
      setEndDrag(null);
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape, true);
    };
  }, [batchUpdateItems]);

  // ── endpoint handles of a single selected connector ────────────────────
  const selectedConnector = useMemo(() => {
    if (!enabled || selectedIds.length !== 1) return null;
    const item = byId.get(selectedIds[0]);
    return item?.type === "connector" ? item : null;
  }, [byId, enabled, selectedIds]);

  if (!selectedConnector && !endDrag) return null;
  const route = selectedConnector ? getConnectorRoute(selectedConnector, byId) : null;
  const scale = 1 / Math.max(zoom, 0.01);

  const startEndDrag = (event: ReactPointerEvent<HTMLDivElement>, end: EndName) => {
    if (!selectedConnector || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Window listeners still track the drag.
    }
    const next: EndDrag = { pointerId: event.pointerId, connectorId: selectedConnector.id, end, original: selectedConnector.props, target: null };
    endDragRef.current = next;
    setEndDrag(next);
  };

  // A locked connector keeps its ends: no handles to re-route it.
  const locked = selectedConnector ? isElementLocked(selectedConnector) : false;
  const ends: Array<{ end: EndName; point: Vec }> = route && !locked
    ? [
        { end: "source", point: route.points[0] },
        { end: "target", point: route.points[route.points.length - 1] },
      ]
    : [];

  return (
    <>
      {endDrag?.target && (
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" style={{ zIndex: 1200 }}>
          <ConnectionOverlay
            anchors={endDrag.target.anchors}
            highlight={endDrag.target.kind === "free" ? null : endDrag.target.point}
            zoom={zoom}
          />
        </svg>
      )}
      {ends.map(({ end, point }) => (
        // 24 px invisible hit area (touch-friendly) around AFFiNE's 12 px handle.
        <div
          key={end}
          role="button"
          aria-label={end === "source" ? "Move connector start" : "Move connector end"}
          data-connector-endpoint={end}
          data-no-canvas-gesture="true"
          onPointerDown={(event) => startEndDrag(event, end)}
          className="pointer-events-auto absolute flex touch-none items-center justify-center"
          style={{
            left: point.x,
            top: point.y,
            width: ENDPOINT_HIT_PX,
            height: ENDPOINT_HIT_PX,
            transform: `translate(-50%, -50%) scale(${scale})`,
            cursor: "pointer",
            zIndex: 1201,
          }}
        >
          <span
            aria-hidden="true"
            className="block rounded-full"
            style={{
              width: ENDPOINT_HANDLE_PX,
              height: ENDPOINT_HANDLE_PX,
              border: `2px solid ${CONNECTION_EMPHASIS_COLOR}`,
              background: "#ffffff",
              boxSizing: "border-box",
            }}
          />
        </div>
      ))}
    </>
  );
}
