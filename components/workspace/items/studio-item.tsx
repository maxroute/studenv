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
  isConnecting?: boolean;
  isDrawingMode?: boolean;
  canvasScale?: number;
  disableDragging?: boolean;
  enableResizing?: boolean;
  showDeleteButton?: boolean;
  showConnectionHandle?: boolean;
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
  isConnecting,
  isDrawingMode,
  canvasScale = 1,
  disableDragging,
  enableResizing,
  showDeleteButton = true,
  showConnectionHandle = true,
  passThrough = false,
  showRotateButton = false,
  onRotateChange,
  onDrag,
  onDragStop,
}: StudioItemComponentProps) {
  const { updateItem, removeItem } = useWorkspaceStore();
  const [pos, setPos] = useState({ x: item.x, y: item.y });
  const [size, setSize] = useState({ w: item.w, h: item.h });
  const [isRotating, setIsRotating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dragMovedRef = useRef(false);

  const isLocked = (item.props as { locked?: boolean }).locked === true;

  useEffect(() => {
    setPos({ x: item.x, y: item.y });
    setSize({ w: item.w, h: item.h });
  }, [item.x, item.y, item.w, item.h]);

  const disableInteraction = isDrawingMode || isConnecting;
  const draggingDisabled = disableDragging ?? (disableInteraction || isRotating || isLocked);
  const resizingEnabled = enableResizing ?? (!disableInteraction && !isLocked);

  useEffect(() => {
    if (!isRotating) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!rootRef.current || !onRotateChange) {
        return;
      }

      const rect = rootRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
      const degrees = (angle * 180) / Math.PI + 90;
      const normalized = (degrees + 360) % 360;

      onRotateChange(normalized);
    };

    const handlePointerUp = () => {
      setIsRotating(false);
    };

    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", handlePointerUp, true);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
    };
  }, [isRotating, onRotateChange]);

  return (
    <Rnd
      size={{ width: size.w, height: size.h }}
      position={{ x: pos.x, y: pos.y }}
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
          setPos({ x: startPos.x + dx, y: startPos.y + dy });
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
          setPos({ x: startPos.x + dx, y: startPos.y + dy });
          updateItem(item.id, { x: startPos.x + dx, y: startPos.y + dy });
        }
        dragStartPositionsRef.current = new Map();
        if (onDragStop) {
          onDragStop();
        }
      }}
      onResize={(e, direction, ref, delta, position) => {
        setSize({ w: parseInt(ref.style.width), h: parseInt(ref.style.height) });
        setPos(position);
      }}
      onResizeStop={(e, direction, ref, delta, position) => {
        const newSize = { w: parseInt(ref.style.width), h: parseInt(ref.style.height) };
        setSize(newSize);
        setPos(position);
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
        data-drawing-id={item.type === "drawing" ? item.id : undefined}
        data-image-id={item.type === "image" ? item.id : undefined}
        data-shape-id={item.type === "shape" ? item.id : undefined}
      >
        <div className={`w-full h-full relative ${
          isCanvasPrimitive(item.type)
            ? "overflow-visible bg-transparent border-0 shadow-none"
            : "overflow-hidden bg-white border shadow-md rounded"
        }`}>
          {!isConnecting && !isDrawingMode && item.type !== "sticky" && item.type !== "free-text" && item.type !== "shape" && <div className="drag-handle absolute inset-0 cursor-move" />}
          {isConnecting && (
            <div 
              className="absolute inset-0 z-50 cursor-crosshair bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onClick?.();
              }}
            />
          )}
          <div
            className="relative z-10 w-full h-full"
            style={{
              pointerEvents: isDrawingMode || passThrough ? "none" : "auto",
              cursor: isDrawingMode ? "inherit" : undefined,
              transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
              transformOrigin: "center",
            }}
          >
             {children}
          </div>
          {!isConnecting && !isDrawingMode && item.type === "image" && (
            <div
              aria-hidden="true"
              className="drag-handle absolute inset-0 z-20 cursor-move"
            />
          )}
        </div>

        {/* Connection Handle (Right Side) */}
        {!isConnecting && !isDrawingMode && showConnectionHandle && (
           <button
             onClick={(e) => {
               e.stopPropagation();
               // Trigger connection mode and select this node
               // We need a way to tell the parent, but for now just a UI cue
             }}
             className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-indigo-500 rounded-full border-2 border-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-30 hover:scale-125"
             title="Click to start connection"
           />
        )}

        {!isDrawingMode && showDeleteButton && !isLocked && (
          <button
            onPointerDown={(e) => {
              // Keep delete clicks from reaching canvas/item selection handlers.
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              removeItem(item.id);
            }}
            className="pointer-events-auto absolute -top-2 -right-2 z-30 opacity-0 group-hover:opacity-100 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-opacity shadow-md"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        )}


      </div>
    </Rnd>
  );
}
