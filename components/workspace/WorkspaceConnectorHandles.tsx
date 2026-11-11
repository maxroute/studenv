"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { StudioItem, ConnectorAnchor } from "@/types/workspace";
import {
  getConnectorAnchorPoint,
  getConnectorPath,
  getNearestConnectorAnchor,
  isConnectableWorkspaceItem,
  type ConnectorPoint,
} from "@/lib/workspace/connector-geometry";
import { getEffectiveRotation } from "@/lib/workspace/selection-frame";
import { useSelectionStore } from "@/lib/workspace/selection-engine";

type Candidate = { itemId: string; anchor: ConnectorAnchor; point: ConnectorPoint; distance: number };
type DragState = {
  pointerId: number;
  sourceId: string;
  sourceAnchor: ConnectorAnchor;
  sourcePoint: ConnectorPoint;
  pointer: ConnectorPoint;
  candidate: Candidate | null;
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
  onCreate: (sourceId: string, sourceAnchor: ConnectorAnchor, targetId: string, targetAnchor: ConnectorAnchor) => void;
}

const ANCHORS: ConnectorAnchor[] = ["top", "right", "bottom", "left"];
const TARGET_HIT_RADIUS_PX = 28;
const DRAG_START_PX = 4;

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

  const findCandidate = useCallback((sourceId: string, point: ConnectorPoint): Candidate | null => {
    let nearest: Candidate | null = null;
    for (const item of itemsRef.current) {
      if (item.id === sourceId || !isConnectableWorkspaceItem(item)) continue;
      const candidate = getNearestConnectorAnchor(item, point);
      if (!nearest || candidate.distance < nearest.distance) {
        nearest = { itemId: item.id, ...candidate };
      }
    }
    const hitRadius = TARGET_HIT_RADIUS_PX / Math.max(0.1, scaleRef.current);
    return nearest && nearest.distance <= hitRadius ? nearest : null;
  }, []);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const moved = current.moved || Math.hypot(
        event.clientX - current.startClientX,
        event.clientY - current.startClientY,
      ) >= DRAG_START_PX;
      const pointer = screenToWorldRef.current(event.clientX, event.clientY);
      const next = {
        ...current,
        moved,
        pointer,
        candidate: moved ? findCandidate(current.sourceId, pointer) : null,
      };
      dragRef.current = next;
      setDrag(next);
      event.preventDefault();
    };

    const finish = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDrag(null);
      if (current.moved && current.candidate) {
        onCreateRef.current(
          current.sourceId,
          current.sourceAnchor,
          current.candidate.itemId,
          current.candidate.anchor,
        );
      }
    };

    const cancel = (event: PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDrag(null);
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [findCandidate]);

  const startConnection = (event: ReactPointerEvent<HTMLButtonElement>, anchor: ConnectorAnchor) => {
    if (!selected || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const pointer = screenToWorldRef.current(event.clientX, event.clientY);
    const next: DragState = {
      pointerId: event.pointerId,
      sourceId: selected.id,
      sourceAnchor: anchor,
      sourcePoint: getConnectorAnchorPoint(selected, anchor),
      pointer,
      candidate: null,
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

  const previewEnd = drag?.candidate?.point ?? drag?.pointer;
  // Follow the live rotate preview so handles stay on the outline mid-gesture.
  const selectedRotation = selected ? getEffectiveRotation(selected, rotationPreviews) : 0;
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 1200 }} aria-label="Connector controls">
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {drag?.moved && previewEnd && (
          <path
            d={getConnectorPath(drag.sourcePoint, previewEnd)}
            fill="none"
            stroke={drag.candidate ? "#2563eb" : "#94a3b8"}
            strokeWidth={2}
            strokeDasharray="6 5"
            strokeLinecap="round"
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
            style={{ left: point.x, top: point.y }}
          />
        );
      })}
      {drag?.candidate && (
        <div
          className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow"
          style={{ left: drag.candidate.point.x, top: drag.candidate.point.y }}
        />
      )}
    </div>
  );
}
