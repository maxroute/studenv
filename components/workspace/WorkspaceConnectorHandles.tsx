"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  DEFAULT_CONNECTOR_COLOR,
  DEFAULT_CONNECTOR_MODE,
  DEFAULT_CONNECTOR_STROKE_WIDTH,
  type ConnectorAnchor,
  type ConnectorEnd,
  type StudioItem,
} from "@/types/workspace";
import { getConnectorAnchorPoint, isConnectableWorkspaceItem, type ConnectorPoint } from "@/lib/workspace/connector-geometry";
import { getConnectorAnchors } from "@/lib/workspace/connector-anchors";
import { findConnectionTarget, type ConnectionTarget } from "@/lib/workspace/connector-target";
import { computeConnectorRoute } from "@/lib/workspace/connector-routing";
import { getEffectiveRotation } from "@/lib/workspace/selection-frame";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import { ConnectorGraphic, type ConnectorGraphicStyle } from "./ConnectorGraphic";
import { ConnectionOverlay } from "./ConnectionOverlay";

type DragState = {
  pointerId: number;
  sourceId: string;
  source: ConnectorEnd;
  pointer: ConnectorPoint;
  target: ConnectionTarget | null;
  startClientX: number;
  startClientY: number;
  moved: boolean;
};

interface WorkspaceConnectorHandlesProps {
  items: StudioItem[];
  selectedIds: string[];
  enabled: boolean;
  canvasScale: number;
  screenToWorld: (clientX: number, clientY: number) => ConnectorPoint;
  onCreate: (source: ConnectorEnd, target: ConnectorEnd) => void;
}

const ANCHORS: ConnectorAnchor[] = ["top", "right", "bottom", "left"];
const DRAG_START_PX = 4;

/** New connectors use AFFiNE's defaults until the style toolbar exists. */
const PREVIEW_STYLE: ConnectorGraphicStyle = {
  color: DEFAULT_CONNECTOR_COLOR,
  strokeWidth: DEFAULT_CONNECTOR_STROKE_WIDTH,
  strokeStyle: "solid",
  frontEndpointStyle: "none",
  rearEndpointStyle: "arrow",
};

export function WorkspaceConnectorHandles({
  items,
  selectedIds,
  enabled,
  canvasScale,
  screenToWorld,
  onCreate,
}: WorkspaceConnectorHandlesProps) {
  const rotationPreviews = useSelectionStore((state) => state.rotationPreviews);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const itemsRef = useRef(items);
  const screenToWorldRef = useRef(screenToWorld);
  const onCreateRef = useRef(onCreate);
  const scaleRef = useRef(canvasScale);

  itemsRef.current = items;
  screenToWorldRef.current = screenToWorld;
  onCreateRef.current = onCreate;
  scaleRef.current = canvasScale;

  const selected = useMemo(() => {
    if (!enabled || selectedIds.length !== 1) return null;
    const item = items.find((candidate) => candidate.id === selectedIds[0]);
    return item && isConnectableWorkspaceItem(item) ? item : null;
  }, [enabled, items, selectedIds]);

  useEffect(() => {
    const clear = () => {
      dragRef.current = null;
      setDrag(null);
    };

    const handleMove = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const moved = current.moved || Math.hypot(
        event.clientX - current.startClientX,
        event.clientY - current.startClientY,
      ) >= DRAG_START_PX;
      const pointer = screenToWorldRef.current(event.clientX, event.clientY);
      const next: DragState = {
        ...current,
        moved,
        pointer,
        target: moved
          ? findConnectionTarget(pointer, itemsRef.current, { zoom: scaleRef.current, excludeIds: [current.sourceId] })
          : null,
      };
      dragRef.current = next;
      setDrag(next);
      event.preventDefault();
    };

    const finish = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      clear();
      // Releasing over empty canvas cancels for now; stage 3 adds AFFiNE's
      // create-on-drop panel.
      if (current.moved && current.target?.targetId) {
        onCreateRef.current(current.source, current.target.end);
      }
    };

    const cancel = (event: PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      clear();
    };

    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dragRef.current) clear();
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape);
    };
  }, []);

  const startConnection = (event: ReactPointerEvent<HTMLButtonElement>, anchor: ConnectorAnchor) => {
    if (!selected || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    // The connector starts at the shape-aware anchor for this side.
    const sideAnchor = getConnectorAnchors(selected).find((candidate) => candidate.side === anchor)!;
    const next: DragState = {
      pointerId: event.pointerId,
      sourceId: selected.id,
      source: { id: selected.id, position: [...sideAnchor.position] },
      pointer: screenToWorldRef.current(event.clientX, event.clientY),
      target: null,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };
    dragRef.current = next;
    setDrag(next);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Window-level listeners remain the fallback for browsers without capture.
    }
  };

  if (!selected && !drag) return null;

  const previewRoute = drag?.moved && drag.target
    ? computeConnectorRoute({ mode: DEFAULT_CONNECTOR_MODE, source: drag.source, target: drag.target.end }, items)
    : null;
  // Follow the live rotate preview so handles stay on the outline mid-gesture.
  const selectedRotation = selected ? getEffectiveRotation(selected, rotationPreviews) : 0;
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 1200 }} aria-label="Connector controls">
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {previewRoute && (
          <g data-connector-preview="true">
            <ConnectorGraphic route={previewRoute} style={PREVIEW_STYLE} />
          </g>
        )}
        {drag?.moved && drag.target && (
          <ConnectionOverlay
            anchors={drag.target.anchors}
            highlight={drag.target.kind === "free" ? null : drag.target.point}
            zoom={canvasScale}
          />
        )}
      </svg>
      {selected && ANCHORS.map((anchor) => {
        const point = getConnectorAnchorPoint(selected, anchor, selectedRotation);
        return (
          <button
            key={anchor}
            type="button"
            aria-label={`Connect from ${anchor}`}
            title={`Drag to connect from ${anchor}`}
            onPointerDown={(event) => startConnection(event, anchor)}
            className="pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500 shadow-md touch-none"
            // Hidden (not unmounted) while dragging: the pressed handle keeps
            // pointer capture, which touch browsers need for the gesture.
            style={{ left: point.x, top: point.y, opacity: drag?.moved ? 0 : 1 }}
          />
        );
      })}
    </div>
  );
}
