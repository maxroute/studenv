"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { ConnectorNode, StudioItem } from "@/types/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import { useConnectorUiStore } from "@/lib/workspace/connector-ui-store";
import { findConnectionTarget, type ConnectionTarget } from "@/lib/workspace/connector-target";
import { getConnectorRoute, groupMoveUpdates, snapshotGroupMove, type GroupMoveSnapshot } from "@/lib/workspace/connector-selection";
import type { Vec } from "@/lib/workspace/connector-anchors";
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
  const [endDrag, setEndDrag] = useState<EndDrag | null>(null);
  const bodyDragRef = useRef<BodyDrag | null>(null);
  const endDragRef = useRef<EndDrag | null>(null);
  const live = useRef({ items, zoom, screenToWorld });
  live.current = { items, zoom, screenToWorld };

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item] as const)), [items]);

  // ── pressing a connector path or label ─────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      setConnectorPointerDown(null);
      return;
    }
    setConnectorPointerDown((connectorId, event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const selection = useSelectionStore.getState();
      if (event.shiftKey) {
        selection.toggle(connectorId);
        return;
      }
      if (!selection.selectedIds.includes(connectorId)) selection.select(connectorId);

      const snapshot = snapshotGroupMove(live.current.items, useSelectionStore.getState().selectedIds);
      bodyDragRef.current = {
        pointerId: event.pointerId,
        startWorld: live.current.screenToWorld(event.clientX, event.clientY),
        startClient: { x: event.clientX, y: event.clientY },
        moving: false,
        snapshot,
      };
    });
    return () => setConnectorPointerDown(null);
  }, [enabled, setConnectorPointerDown]);

  // ── window listeners for body and endpoint drags ───────────────────────
  useEffect(() => {
    const restoreEnd = () => {
      const drag = endDragRef.current;
      if (!drag) return;
      batchUpdateItems([{ id: drag.connectorId, changes: {}, props: { [drag.end]: drag.original[drag.end] } }]);
    };

    const handleMove = (event: PointerEvent) => {
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
      if (event.key !== "Escape" || !endDragRef.current) return;
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

  const ends: Array<{ end: EndName; point: Vec }> = route
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
