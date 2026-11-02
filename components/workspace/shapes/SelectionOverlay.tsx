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

export function SelectionOverlay({ canvasScale, screenToWorld, hoveredItemId }: SelectionOverlayProps) {
  const { selectedIds } = useSelectionStore();
  const { items, updateItem, batchUpdateItems } = useWorkspaceStore();
  const [transformState, setTransformState] = useState<TransformState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter selected items that are migrated to this overlay
  const selectedItems = items.filter((item) => selectedIds.includes(item.id) && isMigratedToSelectionOverlay(item.type));
  const hoveredItem = hoveredItemId ? items.find((i) => i.id === hoveredItemId) : null;

  // Handle pointer down on a resize handle
  const handleResizeStart = (
    e: React.PointerEvent,
    itemId: string,
    handle: ResizeHandle
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const item = items.find((i) => i.id === itemId);
    if (!item || (item.props as { locked?: boolean }).locked) return;

    const startPointer = screenToWorld(e.clientX, e.clientY);
    const startBounds = new Map<string, Bounds>();
    startBounds.set(itemId, { x: item.x, y: item.y, w: item.w, h: item.h });

    setTransformState({
      type: "resize",
      handle,
      startBounds,
      startRotations: new Map([[itemId, item.rotation]]),
      startPointer,
    });
    if (containerRef.current) {
      containerRef.current.setPointerCapture(e.pointerId);
    }
  };

  // Handle pointer down on rotation knob
  const handleRotateStart = (e: React.PointerEvent, itemId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const item = items.find((i) => i.id === itemId);
    if (!item || (item.props as { locked?: boolean }).locked) return;

    const startPointer = screenToWorld(e.clientX, e.clientY);
    const startBounds = new Map<string, Bounds>();
    startBounds.set(itemId, { x: item.x, y: item.y, w: item.w, h: item.h });

    setTransformState({
      type: "rotate",
      startBounds,
      startRotations: new Map([[itemId, item.rotation]]),
      startPointer,
    });
    if (containerRef.current) {
      containerRef.current.setPointerCapture(e.pointerId);
    }
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
      const updates: Array<{ id: string; changes: any }> = [];
      transformState.startBounds.forEach((startBounds, itemId) => {
        const item = items.find((i) => i.id === itemId);
        if (!item) return;

        // Force lock aspect ratio for perfect circles, shapes holding shift
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
          item.rotation ?? 0
        );

        updates.push({
          id: itemId,
          changes: {
            x: newBounds.x,
            y: newBounds.y,
            w: newBounds.w,
            h: newBounds.h,
          },
        });
      });
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
    if (containerRef.current) {
      containerRef.current.releasePointerCapture(e.pointerId);
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

              {!isLocked && (
                <div
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

              {!isLocked && (
                <div
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
              transform: `rotate(${item.rotation ?? 0}deg)`,
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
            {!isLocked &&
              baseHandles.map((hType) => (
                <div
                  key={hType}
                  className="absolute bg-white border border-[#f5a623] rounded-full shadow-sm pointer-events-auto hover:bg-[#f5a623]/10 hover:scale-125 transition-all duration-100"
                  style={{
                    width: handleSize,
                    height: handleSize,
                    cursor: getRotatedCursor(hType, item.rotation ?? 0),
                    zIndex: 10,
                    borderWidth: Math.max(1, 1.5 / canvasScale),
                    ...handleStyles[hType],
                  }}
                  onPointerDown={(e) => handleResizeStart(e, item.id, hType)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                />
              ))}

            {/* Rotation Handle (Hidden if locked) */}
            {!isLocked && (
              <div
                className="absolute flex flex-col items-center pointer-events-auto"
                style={{
                  left: "50%",
                  top: -20 / canvasScale - handleSize,
                  transform: "translateX(-50%)",
                  width: handleSize * 2,
                  zIndex: 10,
                }}
              >
                {/* Knob */}
                <div
                  className="bg-white border border-[#f5a623] rounded-full shadow-sm hover:bg-[#f5a623]/10 hover:scale-125 transition-all duration-100 cursor-alias"
                  style={{
                    width: handleSize * 1.3,
                    height: handleSize * 1.3,
                    borderWidth: Math.max(1, 1.5 / canvasScale),
                  }}
                  onPointerDown={(e) => handleRotateStart(e, item.id)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                />
                {/* Connecting Line */}
                <div
                  className="bg-[#f5a623]"
                  style={{
                    width: Math.max(1, 1.5 / canvasScale),
                    height: 20 / canvasScale,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
