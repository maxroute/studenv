"use client";

import { StudioItem } from "@/types/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import { ReactNode, useState, useEffect, useRef } from "react";
import { Rnd } from "react-rnd";
import { RotateCw, X } from "lucide-react";
import { isCanvasPrimitive, isMigratedToSelectionOverlay } from "@/lib/workspace/shape-engine";

interface StudioItemComponentProps {
  item: StudioItem;
  children: ReactNode;
  onClick?: () => void;
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerEnter?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerLeave?: (event: React.PointerEvent<HTMLDivElement>) => void;
  className?: string;
  isDrawingMode?: boolean;
  canvasScale?: number;
  disableDragging?: boolean;
  enableResizing?: boolean;
  showDeleteButton?: boolean;
  passThrough?: boolean;
  showRotateButton?: boolean;
  onRotateChange?: (rotation: number) => void;
  onDrag?: (itemId: string, x: number, y: number) => { x: number; y: number };
  onDragStop?: () => void;
}

export function StudioItemComponent({
  item,
  children,
  onClick,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  className,
  isDrawingMode,
  canvasScale = 1,
  disableDragging,
  enableResizing,
  showDeleteButton = true,
  passThrough = false,
  showRotateButton = false,
  onRotateChange,
  onDrag,
  onDragStop,
}: StudioItemComponentProps) {
  const { updateItem } = useWorkspaceStore();
  const [size, setSize] = useState({ w: item.w, h: item.h });
  const [isRotating, setIsRotating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const rotationStartRef = useRef<{
    centerX: number;
    centerY: number;
    lastAngle: number;
    accumulatedDelta: number;
    startRotation: number;
  } | null>(null);
  const rotationPreviewRef = useRef<number>(item.rotation ?? 0);
  const rotationFrameRef = useRef<number | null>(null);
  const pendingRotationRef = useRef<number | null>(null);
  const rotatedContentRef = useRef<HTMLDivElement>(null);
  const rotationControlsRef = useRef<HTMLDivElement>(null);
  const onRotateChangeRef = useRef(onRotateChange);
  onRotateChangeRef.current = onRotateChange;
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dragMovedRef = useRef(false);

  const isLocked = (item.props as { locked?: boolean }).locked === true;

  useEffect(() => {
    setSize({ w: item.w, h: item.h });
  }, [item.x, item.y, item.w, item.h]);

  const disableInteraction = isDrawingMode;
  const draggingDisabled = disableDragging ?? (disableInteraction || isRotating || isLocked);
  const resizingEnabled = enableResizing ?? (!disableInteraction && !isLocked);

  useEffect(() => {
    if (!isRotating) return;

    const applyPreview = () => {
      rotationFrameRef.current = null;
      const rotation = pendingRotationRef.current;
      if (rotation === null) return;
      const transform = `rotate(${rotation}deg)`;
      if (rotatedContentRef.current) rotatedContentRef.current.style.transform = transform;
      if (rotationControlsRef.current) rotationControlsRef.current.style.transform = transform;
    };

    const finishRotation = () => {
      const start = rotationStartRef.current;
      if (!start) return;

      if (rotationFrameRef.current !== null) {
        cancelAnimationFrame(rotationFrameRef.current);
        rotationFrameRef.current = null;
      }
      applyPreview();

      // Keep the accumulated angle unwrapped. Normalizing 360° to 0° here
      // changes the numeric transform at pointer-up and can make the visual
      // rotation snap/reverse even though both angles represent the same pose.
      const finalRotation = rotationPreviewRef.current;
      rotationStartRef.current = null;
      pendingRotationRef.current = null;
      setIsRotating(false);
      onRotateChangeRef.current?.(finalRotation);
      requestAnimationFrame(() => useSelectionStore.getState().clearRotationPreview(item.id));
    };

    const handlePointerMove = (event: PointerEvent) => {
      const start = rotationStartRef.current;
      if (!start) return;

      const angle = Math.atan2(
        event.clientY - start.centerY,
        event.clientX - start.centerX
      );
      const delta = Math.atan2(
        Math.sin(angle - start.lastAngle),
        Math.cos(angle - start.lastAngle)
      );
      start.accumulatedDelta += delta;
      start.lastAngle = angle;

      rotationPreviewRef.current = start.startRotation + (start.accumulatedDelta * 180) / Math.PI;
      pendingRotationRef.current = rotationPreviewRef.current;
      useSelectionStore.getState().setRotationPreview(item.id, rotationPreviewRef.current);
      if (rotationFrameRef.current === null) {
        rotationFrameRef.current = requestAnimationFrame(applyPreview);
      }
    };

    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", finishRotation, true);
    document.addEventListener("pointercancel", finishRotation, true);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", finishRotation, true);
      document.removeEventListener("pointercancel", finishRotation, true);
      if (rotationFrameRef.current !== null) {
        cancelAnimationFrame(rotationFrameRef.current);
        rotationFrameRef.current = null;
      }
    };
  }, [isRotating]);

  return (
    <Rnd
      className="workspace-item-rnd"
      size={{ width: size.w, height: size.h }}
      position={{ x: item.x, y: item.y }}
      scale={canvasScale}
      minWidth={1}
      minHeight={1}
      disableDragging={draggingDisabled}
      enableResizing={isMigratedToSelectionOverlay(item.type) ? false : resizingEnabled}
      onDragStart={() => {
        // react-draggable fires onStart as soon as a mouse/touch gesture begins,
        // not only after the pointer has actually moved.
        dragMovedRef.current = false;
        const { selectedIds } = useSelectionStore.getState();
        const { items } = useWorkspaceStore.getState();

        if (selectedIds.includes(item.id)) {
          const positions = new Map<string, { x: number; y: number }>();
          items.forEach((itm) => {
            if (selectedIds.includes(itm.id) && !(itm.props as { locked?: boolean }).locked) {
              positions.set(itm.id, { x: itm.x, y: itm.y });
            }
          });
          dragStartPositionsRef.current = positions;
        } else {
          dragStartPositionsRef.current = new Map([[item.id, { x: item.x, y: item.y }]]);
        }
      }}
      onDrag={(e, d) => {
        const { selectedIds } = useSelectionStore.getState();
        const startPos = dragStartPositionsRef.current.get(item.id);
        if (!startPos) return;

        let dx = d.x - startPos.x;
        let dy = d.y - startPos.y;

        if (item.type === "free-text" && Math.hypot(dx, dy) > 2) {
          dragMovedRef.current = true;
        }

        if (onDrag) {
          const snapped = onDrag(item.id, startPos.x + dx, startPos.y + dy);
          dx = snapped.x - startPos.x;
          dy = snapped.y - startPos.y;
        }

        if (selectedIds.includes(item.id)) {
          const updates: Array<{ id: string; changes: any }> = [];
          dragStartPositionsRef.current.forEach((pos, itmId) => {
            updates.push({
              id: itmId,
              changes: {
                x: pos.x + dx,
                y: pos.y + dy,
              },
            });
          });
          useWorkspaceStore.getState().batchUpdateItems(updates);
        } else {
          updateItem(item.id, { x: startPos.x + dx, y: startPos.y + dy });
        }
      }}
      onDragStop={(e, d) => {
        const { selectedIds } = useSelectionStore.getState();
        const startPos = dragStartPositionsRef.current.get(item.id);
        if (!startPos) return;

        // A press can start an Rnd gesture without ever becoming a drag.
        // In particular, a touch used to dismiss a text editor can end outside
        // the item and still trigger onDragStop. Never commit that end position.
        const didMove = item.type !== "free-text" || dragMovedRef.current;
        dragMovedRef.current = false;
        if (!didMove) {
          dragStartPositionsRef.current = new Map();
          onDragStop?.();
          return;
        }

        let dx = d.x - startPos.x;
        let dy = d.y - startPos.y;

        if (onDrag) {
          const snapped = onDrag(item.id, startPos.x + dx, startPos.y + dy);
          dx = snapped.x - startPos.x;
          dy = snapped.y - startPos.y;
        }

        if (selectedIds.includes(item.id)) {
          const updates: Array<{ id: string; changes: any }> = [];
          dragStartPositionsRef.current.forEach((pos, itmId) => {
            updates.push({
              id: itmId,
              changes: {
                x: pos.x + dx,
                y: pos.y + dy,
              },
            });
          });
          useWorkspaceStore.getState().batchUpdateItems(updates);
        } else {
          updateItem(item.id, { x: startPos.x + dx, y: startPos.y + dy });
        }
        dragStartPositionsRef.current = new Map();
        if (onDragStop) {
          onDragStop();
        }
      }}
      onResize={(e, direction, ref, delta, position) => {
        setSize({ w: parseInt(ref.style.width), h: parseInt(ref.style.height) });
        // Keep the authoritative workspace position in sync during west/north resizes.
        updateItem(item.id, { x: position.x, y: position.y });
      }}
      onResizeStop={(e, direction, ref, delta, position) => {
        const newSize = { w: parseInt(ref.style.width), h: parseInt(ref.style.height) };
        setSize(newSize);
        updateItem(item.id, {
          ...newSize,
          ...position,
        });
      }}
      style={{
        zIndex: item.zIndex,
        pointerEvents: isDrawingMode || passThrough ? "none" : "auto",
      }}
      dragHandleClassName="drag-handle"
    >
      <div
        ref={rootRef}
        className={`w-full h-full relative group ${className ?? ""}`}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        data-workspace-item="true"
        data-workspace-item-id={item.id}
        data-workspace-item-type={item.type}
        data-drawing-id={item.type === "drawing" ? item.id : undefined}
        data-image-id={item.type === "image" ? item.id : undefined}
        data-shape-id={item.type === "shape" ? item.id : undefined}
      >
        <div className={`w-full h-full relative ${isCanvasPrimitive(item.type) || item.type === "image"
          ? "overflow-visible bg-transparent border-0 shadow-none rounded-none"
          : "overflow-hidden bg-white border shadow-md rounded"
          }`}>
          {!isDrawingMode && item.type !== "sticky" && item.type !== "free-text" && item.type !== "shape" && <div className="drag-handle absolute inset-0 cursor-move" />}
          <div
            ref={rotatedContentRef}
            className="relative z-10 w-full h-full"
            style={{
              pointerEvents: isDrawingMode || passThrough ? "none" : "auto",
              cursor: isDrawingMode ? "inherit" : undefined,
              transform: `rotate(${item.rotation ?? 0}deg)`,
              transformOrigin: "center",
            }}
          >
            {children}
          </div>
          {!isDrawingMode && item.type === "image" && (
            <div
              aria-hidden="true"
              className="drag-handle absolute inset-0 z-20 cursor-move"
            />
          )}
        </div>

        {!isDrawingMode && showRotateButton && !isLocked && (
          <div
            ref={rotationControlsRef}
            className="pointer-events-none absolute inset-0 z-30"
            style={{
              transform: `rotate(${item.rotation ?? 0}deg)`,
              transformOrigin: "center",
            }}
          >
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const rect = rootRef.current?.getBoundingClientRect();
                if (!rect) return;
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
                const startRotation = item.rotation ?? 0;
                rotationPreviewRef.current = startRotation;
                pendingRotationRef.current = startRotation;
                rotationStartRef.current = {
                  centerX,
                  centerY,
                  lastAngle: startAngle,
                  accumulatedDelta: 0,
                  startRotation,
                };
                setIsRotating(true);
              }}
              className={`pointer-events-auto absolute -top-[25px] left-1/2 -translate-x-1/2 p-1 bg-slate-900 text-white rounded-full hover:bg-slate-700 shadow-md ${isRotating ? "opacity-100" : "opacity-0 group-hover:opacity-100 transition-opacity"
                }`}
              style={{ transform: `translateX(-50%) rotate(-${item.rotation ?? 0}deg)` }}
              title="Drag to rotate"
            >
              <RotateCw className="w-3 h-3 text-white" />
            </button>
          </div>
        )}

        {!isDrawingMode && showDeleteButton && !isLocked && (
          <button
            onPointerDown={(e) => {
              // Keep delete clicks from reaching canvas/item selection handlers.
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              const selectedIds = useSelectionStore.getState().selectedIds;
              const idsToRemove = selectedIds.includes(item.id) ? selectedIds : [item.id];
              useWorkspaceStore.getState().removeItems(idsToRemove);
              useSelectionStore.getState().deselectAll();
            }}
            className="pointer-events-auto absolute -top-[20px] -right-[20px] z-30 opacity-0 group-hover:opacity-100 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-opacity shadow-md"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        )}


      </div>
    </Rnd>
  );
}
