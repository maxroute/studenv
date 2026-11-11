"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { StudioItem } from "@/types/workspace";
import {
  getConnectorAnchorPoint,
  getNearestConnectorAnchor,
  getConnectorPath,
  isConnectableWorkspaceItem,
  type ConnectorAnchor,
  type Point,
} from "@/lib/workspace/connector-geometry";

type Candidate = { itemId: string; anchor: ConnectorAnchor; point: Point; distance: number };
type DragState = { sourceId: string; sourceAnchor: ConnectorAnchor; sourcePoint: Point; pointer: Point; candidate: Candidate | null };

interface WorkspaceConnectorHandlesProps {
  items: StudioItem[];
  selectedIds: string[];
  enabled: boolean;
  screenToWorld: (clientX: number, clientY: number) => Point;
  onCreate: (sourceId: string, sourceAnchor: ConnectorAnchor, targetId: string, targetAnchor: ConnectorAnchor) => void;
}

const ANCHORS: ConnectorAnchor[] = ["top", "right", "bottom", "left"];

export function WorkspaceConnectorHandles({
  items, selectedIds, enabled, screenToWorld, onCreate,
}: WorkspaceConnectorHandlesProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const selected = useMemo(() => {
    if (!enabled || selectedIds.length !== 1) return null;
    const item = items.find((candidate) => candidate.id === selectedIds[0]);
    return item && item.type !== "connector" && isConnectableWorkspaceItem(item) ? item : null;
  }, [enabled, items, selectedIds]);

  const findCandidate = useCallback((sourceId: string, point: Point): Candidate | null => {
    let nearest: Candidate | null = null;
    for (const item of items) {
      if (item.id === sourceId || item.type === "connector" || !isConnectableWorkspaceItem(item)) continue;
      const candidate = getNearestConnectorAnchor(item, point);
      if (!nearest || candidate.distance < nearest.distance) {
        nearest = { itemId: item.id, ...candidate };
      }
    }
    return nearest && nearest.distance <= 34 ? nearest : null;
  }, [items]);

  useEffect(() => {
    if (!drag) return;
    const handleMove = (event: PointerEvent) => {
      const pointer = screenToWorld(event.clientX, event.clientY);
      setDrag((current) => current ? {
        ...current,
        pointer,
        candidate: findCandidate(current.sourceId, pointer),
      } : null);
    };
    const handleUp = () => {
      if (drag.candidate) {
        onCreate(drag.sourceId, drag.sourceAnchor, drag.candidate.itemId, drag.candidate.anchor);
      }
      setDrag(null);
    };
    const handleCancel = () => setDrag(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
  }, [drag, findCandidate, onCreate, screenToWorld]);

  const startConnection = (event: ReactPointerEvent<HTMLButtonElement>, anchor: ConnectorAnchor) => {
    if (!selected) return;
    event.preventDefault();
    event.stopPropagation();
    const sourcePoint = getConnectorAnchorPoint(selected, anchor);
    const pointer = screenToWorld(event.clientX, event.clientY);
    setDrag({
      sourceId: selected.id,
      sourceAnchor: anchor,
      sourcePoint,
      pointer,
      candidate: findCandidate(selected.id, pointer),
    });
  };

  if (!selected && !drag) return null;

  const previewEnd = drag?.candidate?.point ?? drag?.pointer;
  return (
    <div className="absolute inset-0 z-[950] pointer-events-none" aria-label="Connector controls">
      <svg className="absolute inset-0 h-full w-full overflow-visible pointer-events-none">
        {drag && previewEnd && (
          <path
            d={getConnectorPath(drag.sourcePoint, previewEnd)}
            fill="none"
            stroke={drag.candidate ? "#2563eb" : "#94a3b8"}
            strokeWidth="2"
            strokeDasharray="5 4"
          />
        )}
      </svg>
      {selected && ANCHORS.map((anchor) => {
        const point = getConnectorAnchorPoint(selected, anchor);
        return (
          <button
            key={anchor}
            type="button"
            aria-label={`Create connection from ${anchor}`}
            title={`Drag to connect from ${anchor}`}
            onPointerDown={(event) => startConnection(event, anchor)}
            className="pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500 shadow-md touch-none"
            style={{ left: point.x, top: point.y }}
          />
        );
      })}
      {drag?.candidate && (
        <div
          className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow"
          style={{ left: drag.candidate.point.x, top: drag.candidate.point.y }}
        />
      )}
    </div>
  );
}
