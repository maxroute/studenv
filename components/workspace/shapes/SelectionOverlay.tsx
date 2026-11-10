// ---------------------------------------------------------------------------
// Shape Tool – Interactive Resize & Rotation Handles Overlay (Professional Standard)
// ---------------------------------------------------------------------------

"use client";

import React, { useState, useRef, useEffect } from "react";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import type { ResizeHandle, Bounds } from "@/lib/workspace/transform-engine";
import { computeResize, computeRotation } from "@/lib/workspace/transform-engine";
import { getShapePath } from "@/lib/workspace/shape-paths";
import { isMigratedToSelectionOverlay } from "@/lib/workspace/shape-engine";

interface SelectionOverlayProps {
  canvasScale: number;
  screenToWorld: (clientX: number, clientY: number) => { x: number; y: number };
  hoveredItemId?: string | null;
  interactive?: boolean;
}

interface TransformState {
  type: "resize" | "rotate" | "endpoint-start" | "endpoint-end";
  handle?: ResizeHandle;
  startBounds: Map<string, Bounds>; // itemId -> starting bounds
  startRotations: Map<string, number>; // itemId -> starting rotation
  startPointer: { x: number; y: number };
}

/**
 * Rotation-aware cursor mapping. Calculates the correct screen resize cursor
 * based on the handle position and the item's current rotation angle.
 */
function getRotatedCursor(handle: ResizeHandle, rotation: number): string {
  const baseAngles: Record<ResizeHandle, number> = {
    n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315
  };
  const angle = (baseAngles[handle] + (rotation ?? 0)) % 360;
  
  if (angle < 22.5 || angle >= 337.5 || (angle >= 157.5 && angle < 202.5)) {
    return "ns-resize";
  } else if ((angle >= 22.5 && angle < 67.5) || (angle >= 202.5 && angle < 247.5)) {
    return "nesw-resize";
  } else if ((angle >= 67.5 && angle < 112.5) || (angle >= 247.5 && angle < 292.5)) {
    return "ew-resize";
  } else {
    return "nwse-resize";
  }
}

export function SelectionOverlay({ canvasScale, screenToWorld, hoveredItemId, interactive = true }: SelectionOverlayProps) {
  const { selectedIds, rotationPreviews } = useSelectionStore();
  const { items, updateItem, batchUpdateItems } = useWorkspaceStore();
  const [transformState, setTransformState] = useState<TransformState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const groupDragRef = useRef<{
    pointerId: number;
    startPointer: { x: number; y: number };
    startPositions: Map<string, { x: number; y: number }>;
  } | null>(null);

  const handleGroupDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (allSelectedItems.length < 2 || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startPositions = new Map<string, { x: number; y: number }>();
    allSelectedItems.forEach((item) => {
      if (!(item.props as { locked?: boolean }).locked) {
        startPositions.set(item.id, { x: item.x, y: item.y });
      }
    });
    if (startPositions.size === 0) return;
    groupDragRef.current = {
      pointerId: event.pointerId,
      startPointer: screenToWorld(event.clientX, event.clientY),
      startPositions,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleGroupDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = groupDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const currentPointer = screenToWorld(event.clientX, event.clientY);
    const dx = currentPointer.x - drag.startPointer.x;
    const dy = currentPointer.y - drag.startPointer.y;
    batchUpdateItems(Array.from(drag.startPositions, ([id, position]) => ({
      id,
      changes: { x: position.x + dx, y: position.y + dy },
    })));
  };

  const handleGroupDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (groupDragRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    groupDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // Keep individual object handles for migrated items, while deriving one
  // shared axis-aligned boundary from every selected workspace object.
  const allSelectedItems = items.filter((item) => selectedIds.includes(item.id));
  const selectedItems = allSelectedItems.filter((item) => isMigratedToSelectionOverlay(item.type));
  const selectionBounds = allSelectedItems.length > 1
    ? allSelectedItems.reduce(
        (bounds, item) => ({
          left: Math.min(bounds.left, item.x),
          top: Math.min(bounds.top, item.y),
          right: Math.max(bounds.right, item.x + item.w),
          bottom: Math.max(bounds.bottom, item.y + item.h),
        }),
        { left: Number.POSITIVE_INFINITY, top: Number.POSITIVE_INFINITY, right: Number.NEGATIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY },
      )
    : null;
  const hoveredItem = hoveredItemId ? items.find((i) => i.id === hoveredItemId) : null;

  // Handle pointer down on a resize handle
  const handleResizeStart = (
    e: React.PointerEvent,
    itemId: string,
    handle: ResizeHandle
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const targets = allSelectedItems.length > 1
      ? allSelectedItems.filter((item) => !(item.props as { locked?: boolean }).locked)
      : items.filter((item) => item.id === itemId && !(item.props as { locked?: boolean }).locked);
    if (targets.length === 0) return;

    const startPointer = screenToWorld(e.clientX, e.clientY);
    const startBounds = new Map<string, Bounds>();
    const startRotations = new Map<string, number>();
    targets.forEach((item) => {
      startBounds.set(item.id, { x: item.x, y: item.y, w: item.w, h: item.h });
      startRotations.set(item.id, item.rotation ?? 0);
    });

    setTransformState({
      type: "resize",
      handle,
      startBounds,
      startRotations,
      startPointer,
    });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  // Handle pointer down on line/arrow endpoints
  const handleEndpointDragStart = (
    e: React.PointerEvent,
    itemId: string,
    type: "endpoint-start" | "endpoint-end"
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const item = items.find((i) => i.id === itemId);
    if (!item || (item.props as { locked?: boolean }).locked) return;

    const startPointer = screenToWorld(e.clientX, e.clientY);
    const startBounds = new Map<string, Bounds>();
    startBounds.set(itemId, { x: item.x, y: item.y, w: item.w, h: item.h });

    setTransformState({
      type,
      startBounds,
      startRotations: new Map([[itemId, item.rotation]]),
      startPointer,
    });
    if (e.currentTarget) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!transformState) return;
    e.stopPropagation();
    e.preventDefault();

    const currentPointer = screenToWorld(e.clientX, e.clientY);
    const deltaX = currentPointer.x - transformState.startPointer.x;
    const deltaY = currentPointer.y - transformState.startPointer.y;

    if (transformState.type === "resize" && transformState.handle) {
      const updates: Array<{ id: string; changes: any; props?: Record<string, unknown> }> = [];
      if (transformState.startBounds.size > 1) {
        const starts = Array.from(transformState.startBounds.entries());
        const group = starts.reduce(
          (bounds, [, itemBounds]) => ({
            left: Math.min(bounds.left, itemBounds.x),
            top: Math.min(bounds.top, itemBounds.y),
            right: Math.max(bounds.right, itemBounds.x + itemBounds.w),
            bottom: Math.max(bounds.bottom, itemBounds.y + itemBounds.h),
          }),
          { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const startW = Math.max(1, group.right - group.left);
        const startH = Math.max(1, group.bottom - group.top);
        const anchorX = transformState.handle.includes("w") ? group.right
          : transformState.handle.includes("e") ? group.left : group.left + startW / 2;
        const anchorY = transformState.handle.includes("n") ? group.bottom
          : transformState.handle.includes("s") ? group.top : group.top + startH / 2;
        const nextLeft = transformState.handle.includes("w") ? group.left + deltaX
          : transformState.handle.includes("e") ? group.left : group.left;
        const nextRight = transformState.handle.includes("e") ? group.right + deltaX
          : transformState.handle.includes("w") ? group.right : group.right;
        const nextTop = transformState.handle.includes("n") ? group.top + deltaY
          : transformState.handle.includes("s") ? group.top : group.top;
        const nextBottom = transformState.handle.includes("s") ? group.bottom + deltaY
          : transformState.handle.includes("n") ? group.bottom : group.bottom;
        const nextW = Math.max(10, nextRight - nextLeft);
        const nextH = Math.max(10, nextBottom - nextTop);
        const scaleX = nextW / startW;
        const scaleY = nextH / startH;
        starts.forEach(([itemId, bounds]) => {
          const item = items.find((candidate) => candidate.id === itemId);
          if (!item) return;
          const nextX = anchorX + (bounds.x - anchorX) * scaleX;
          const nextY = anchorY + (bounds.y - anchorY) * scaleY;
          const nextItemW = Math.max(1, bounds.w * scaleX);
          const nextItemH = Math.max(1, bounds.h * scaleY);
          const props = { ...item.props } as Record<string, unknown>;
          const startPoint = props.startPoint as { x: number; y: number } | undefined;
          const endPoint = props.endPoint as { x: number; y: number } | undefined;
          if (startPoint) props.startPoint = { x: anchorX + (startPoint.x - anchorX) * scaleX, y: anchorY + (startPoint.y - anchorY) * scaleY };
          if (endPoint) props.endPoint = { x: anchorX + (endPoint.x - anchorX) * scaleX, y: anchorY + (endPoint.y - anchorY) * scaleY };
          updates.push({
            id: itemId,
            changes: { x: nextX, y: nextY, w: nextItemW, h: nextItemH },
            props,
          });
        });
      } else {
        transformState.startBounds.forEach((startBounds, itemId) => {
          const item = items.find((i) => i.id === itemId);
          if (!item) return;
          const isAspectLocked =
            item.type === "shape" &&
            (item.props.kind === "circle" ||
              item.props.kind === "star" ||
              item.props.kind === "pentagon" ||
              e.shiftKey);
          const newBounds = computeResize(
            transformState.handle!,
            startBounds,
            deltaX,
            deltaY,
            isAspectLocked,
            transformState.startRotations.get(itemId) ?? 0
          );
          updates.push({
            id: itemId,
            changes: { x: newBounds.x, y: newBounds.y, w: newBounds.w, h: newBounds.h },
          });
        });
      }
      batchUpdateItems(updates);
    } else if (transformState.type === "rotate") {
      transformState.startBounds.forEach((startBounds, itemId) => {
        const item = items.find((i) => i.id === itemId);
        if (!item) return;

        const centerX = startBounds.x + startBounds.w / 2;
        const centerY = startBounds.y + startBounds.h / 2;

        // Snapping unless Alt is held
        const shouldSnap = !e.altKey;
        const newRotation = computeRotation(
          { x: centerX, y: centerY },
          currentPointer,
          shouldSnap
        );

        updateItem(itemId, { rotation: newRotation });
      });
    } else if (transformState.type === "endpoint-start" || transformState.type === "endpoint-end") {
      const isStart = transformState.type === "endpoint-start";
      transformState.startBounds.forEach((startBounds, itemId) => {
        const item = items.find((i) => i.id === itemId);
        if (!item || !('startPoint' in item.props) || !item.props.startPoint || !('endPoint' in item.props) || !item.props.endPoint) return;

        const fixedPt = isStart ? item.props.endPoint : item.props.startPoint;
        let dragPt = currentPointer;

        if (e.shiftKey) {
          const dx = currentPointer.x - fixedPt.x;
          const dy = currentPointer.y - fixedPt.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);
          const roundedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          dragPt = {
            x: fixedPt.x + dist * Math.cos(roundedAngle),
            y: fixedPt.y + dist * Math.sin(roundedAngle),
          };
        }

        const newStart = isStart ? dragPt : item.props.startPoint;
        const newEnd = isStart ? item.props.endPoint : dragPt;

        const newX = Math.min(newStart.x, newEnd.x);
        const newY = Math.min(newStart.y, newEnd.y);
        const newW = Math.max(1, Math.abs(newEnd.x - newStart.x));
        const newH = Math.max(1, Math.abs(newEnd.y - newStart.y));

        batchUpdateItems([
          {
            id: itemId,
            changes: { x: newX, y: newY, w: newW, h: newH },
            props: { startPoint: newStart, endPoint: newEnd },
          },
        ]);
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!transformState) return;
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }
    setTransformState(null);
  };

  // Adaptive handle size: scaled for high zoom and capped for usability
  const rawSize = 9 / canvasScale;
  const handleSize = Math.max(7, Math.min(11, rawSize));
  const borderOffset = handleSize / 2;

  // Handles list definition
  const baseHandles: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const handleStyles: Record<ResizeHandle, React.CSSProperties> = {
    nw: { left: -borderOffset, top: -borderOffset },
    n: { left: "50%", marginLeft: -borderOffset, top: -borderOffset },
    ne: { right: -borderOffset, top: -borderOffset },
    e: { right: -borderOffset, top: "50%", marginTop: -borderOffset },
    se: { right: -borderOffset, bottom: -borderOffset },
    s: { left: "50%", marginLeft: -borderOffset, bottom: -borderOffset },
    sw: { left: -borderOffset, bottom: -borderOffset },
    w: { left: -borderOffset, top: "50%", marginTop: -borderOffset },
  };

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-[1100]">
      {selectionBounds && (
        <div
          aria-label={`${allSelectedItems.length} objects selected — drag to move selection`}
          data-no-canvas-gesture="true"
          className="absolute border-2 border-[#f5a623] border-dashed rounded-sm"
          style={{
            left: selectionBounds.left,
            top: selectionBounds.top,
            width: Math.max(1, selectionBounds.right - selectionBounds.left),
            height: Math.max(1, selectionBounds.bottom - selectionBounds.top),
            pointerEvents: interactive ? "auto" : "none",
            cursor: groupDragRef.current ? "grabbing" : "move",
            touchAction: "none",
            background: "transparent",
          }}
          onPointerDown={interactive ? handleGroupDragStart : undefined}
          onPointerMove={interactive ? handleGroupDragMove : undefined}
          onPointerUp={interactive ? handleGroupDragEnd : undefined}
          onPointerCancel={interactive ? handleGroupDragEnd : undefined}
        >
          {interactive && baseHandles.map((handle) => (
            <div
              key={`group-handle-${handle}`}
              data-no-canvas-gesture="true"
              className="absolute rounded-full border border-[#f5a623] bg-white shadow-sm"
              style={{
                width: handleSize,
                height: handleSize,
                zIndex: 12,
                cursor: getRotatedCursor(handle, 0),
                pointerEvents: "auto",
                ...handleStyles[handle],
              }}
              onPointerDown={(event) => handleResizeStart(event, allSelectedItems[0].id, handle)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          ))}
        </div>
      )}
      {/* SVG Hover Outline */}
      {hoveredItem && !selectedIds.includes(hoveredItem.id) && !('locked' in hoveredItem.props && hoveredItem.props.locked) && isMigratedToSelectionOverlay(hoveredItem.type) && (
        <div
          style={{
            position: "absolute",
            left: hoveredItem.x,
            top: hoveredItem.y,
            width: hoveredItem.w,
            height: hoveredItem.h,
            transform: `rotate(${hoveredItem.rotation ?? 0}deg)`,
            transformOrigin: "center",
            pointerEvents: "none",
          }}
        >
          <svg
            className="w-full h-full overflow-visible"
            style={{ pointerEvents: "none" }}
          >
            {hoveredItem.type === "shape" ? (
              hoveredItem.props.kind === "line" || hoveredItem.props.kind === "arrow" ? (
                (() => {
                  const hx1 = hoveredItem.props.startPoint ? hoveredItem.props.startPoint.x - hoveredItem.x : 0;
                  const hy1 = hoveredItem.props.startPoint ? hoveredItem.props.startPoint.y - hoveredItem.y : hoveredItem.h / 2;
                  const hx2 = hoveredItem.props.endPoint ? hoveredItem.props.endPoint.x - hoveredItem.x : hoveredItem.w;
                  const hy2 = hoveredItem.props.endPoint ? hoveredItem.props.endPoint.y - hoveredItem.y : hoveredItem.h / 2;
                  return (
                    <line
                      x1={hx1}
                      y1={hy1}
                      x2={hx2}
                      y2={hy2}
                      fill="none"
                      stroke="#f5a623"
                      strokeOpacity={0.45}
                      strokeWidth={Math.max(1.5, 2 / canvasScale)}
                      strokeLinecap="round"
                    />
                  );
                })()
              ) : (
                <path
                  d={getShapePath(
                    hoveredItem.props.kind,
                    hoveredItem.w,
                    hoveredItem.h,
                    hoveredItem.props.cornerRadius
                  )}
                  fill="none"
                  stroke="#f5a623"
                  strokeOpacity={0.45}
                  strokeWidth={Math.max(1.5, 2 / canvasScale)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )
            ) : (
              <rect
                x={0}
                y={0}
                width={hoveredItem.w}
                height={hoveredItem.h}
                rx={hoveredItem.type === "text" ? 8 : 4}
                fill="none"
                stroke="#f5a623"
                strokeOpacity={0.45}
                strokeWidth={Math.max(1.5, 2 / canvasScale)}
              />
            )}
          </svg>
        </div>
      )}

      {/* Selected Items Bounding Outlines & Handles */}
      {selectedItems.map((item) => {
        const isLocked = (item.props as { locked?: boolean }).locked === true;
        const isLineOrArrow = item.type === "shape" && (item.props.kind === "line" || item.props.kind === "arrow") && item.props.startPoint && item.props.endPoint;

        if (isLineOrArrow) {
          const rx1 = item.props.startPoint!.x - item.x;
          const ry1 = item.props.startPoint!.y - item.y;
          const rx2 = item.props.endPoint!.x - item.x;
          const ry2 = item.props.endPoint!.y - item.y;

          return (
            <div
              key={`overlay-${item.id}`}
              className="animate-in fade-in zoom-in-95 duration-100 ease-out"
              style={{
                position: "absolute",
                left: item.x,
                top: item.y,
                width: item.w,
                height: item.h,
              }}
            >
              <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                <line
                  x1={rx1}
                  y1={ry1}
                  x2={rx2}
                  y2={ry2}
                  stroke={isLocked ? "#f87171" : "#f5a623"}
                  strokeWidth={Math.max(1, 1.5 / canvasScale)}
                  strokeDasharray="4 4"
                />
              </svg>

              {interactive && !isLocked && (
                <div
                  data-no-canvas-gesture="true"
                  data-no-canvas-gesture="true"
                  data-no-canvas-gesture="true"
                  className="absolute bg-white border border-[#f5a623] rounded-full shadow-sm pointer-events-auto hover:bg-[#f5a623]/10 hover:scale-125 transition-all duration-100"
                  style={{
                    width: handleSize * 1.3,
                    height: handleSize * 1.3,
                    left: rx1 - (handleSize * 1.3) / 2,
                    top: ry1 - (handleSize * 1.3) / 2,
                    cursor: "move",
                    zIndex: 10,
                    borderWidth: Math.max(1, 1.5 / canvasScale),
                  }}
                  onPointerDown={(e) => handleEndpointDragStart(e, item.id, "endpoint-start")}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                />
              )}

              {interactive && !isLocked && (
                <div
                  data-no-canvas-gesture="true"
                  className="absolute bg-white border border-[#f5a623] rounded-full shadow-sm pointer-events-auto hover:bg-[#f5a623]/10 hover:scale-125 transition-all duration-100"
                  style={{
                    width: handleSize * 1.3,
                    height: handleSize * 1.3,
                    left: rx2 - (handleSize * 1.3) / 2,
                    top: ry2 - (handleSize * 1.3) / 2,
                    cursor: "move",
                    zIndex: 10,
                    borderWidth: Math.max(1, 1.5 / canvasScale),
                  }}
                  onPointerDown={(e) => handleEndpointDragStart(e, item.id, "endpoint-end")}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                />
              )}
            </div>
          );
        }

        return (
          <div
            key={`overlay-${item.id}`}
            className="animate-in fade-in zoom-in-95 duration-100 ease-out"
            style={{
              position: "absolute",
              left: item.x,
              top: item.y,
              width: item.w,
              height: item.h,
              transform: `rotate(${rotationPreviews[item.id] ?? item.rotation ?? 0}deg)`,
              transformOrigin: "center",
            }}
          >
            {/* Outline Bounding Box */}
            <div
              className={`absolute inset-0 border pointer-events-none transition-colors duration-150 ${
                isLocked ? "border-red-400 border-dashed" : "border-[#f5a623]"
              }`}
              style={{
                borderWidth: Math.max(1.5, 2 / canvasScale),
              }}
            />

            {/* Resize Handles (Hidden if locked) */}
            {interactive && selectedIds.length === 1 && !isLocked &&
              baseHandles.map((hType) => (
                <div
                  key={hType}
                  data-no-canvas-gesture="true"
                  className="absolute bg-white border border-[#f5a623] rounded-full shadow-sm pointer-events-auto hover:bg-[#f5a623]/10 hover:scale-125 transition-all duration-100"
                  style={{
                    width: handleSize,
                    height: handleSize,
                    cursor: getRotatedCursor(hType, rotationPreviews[item.id] ?? item.rotation ?? 0),
                    zIndex: 10,
                    borderWidth: Math.max(1, 1.5 / canvasScale),
                    ...handleStyles[hType],
                  }}
                  onPointerDown={(e) => handleResizeStart(e, item.id, hType)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                />
              ))}


          </div>
        );
      })}
    </div>
  );
}
