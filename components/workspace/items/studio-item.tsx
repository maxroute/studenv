"use client";

import { StudioItem } from "@/types/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import { ReactNode, useState, useEffect, useRef } from "react";
import { Rnd } from "react-rnd";
import { Lock, X } from "lucide-react";
import { ROTATE_CORNERS, ROTATE_ZONE_COARSE_PX, ROTATE_ZONE_PX, getRotateCursor, getRotateZoneBox } from "@/lib/workspace/rotate-handles";
import { isCanvasPrimitive, isMigratedToSelectionOverlay } from "@/lib/workspace/shape-engine";
import { groupMoveUpdates, snapshotGroupMove, type GroupMoveSnapshot } from "@/lib/workspace/connector-selection";
import { isMultiTouchNavigating } from "@/lib/workspace/navigation-state";

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
  // Selected connectors that travel with this drag, moved by their free ends.
  const dragConnectorPropsRef = useRef<GroupMoveSnapshot["connectors"]>(new Map());
  const dragMovedRef = useRef(false);
  // Set when a second finger turns the drag into a two-finger pan / pinch.
  const dragCancelledRef = useRef(false);
  const pressPointerIdRef = useRef<number | null>(null);
  const finishPressRef = useRef<((event: PointerEvent) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (finishPressRef.current) {
        document.removeEventListener("pointerup", finishPressRef.current, true);
        document.removeEventListener("pointercancel", finishPressRef.current, true);
        finishPressRef.current = null;
      }
      pressPointerIdRef.current = null;
    };
  }, []);

  const handleItemPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    onPointerDown?.(event);
    if (event.button !== 0 || event.defaultPrevented) return;

    // Hide hover/selection feedback on press, not after react-draggable's
    // movement threshold. Restore it on release even when this was only a click.
    pressPointerIdRef.current = event.pointerId;
    const selectedIds = useSelectionStore.getState().selectedIds;
    useSelectionStore.getState().setDraggingIds(selectedIds.includes(item.id) ? selectedIds : [item.id]);

    const finish = (nativeEvent: PointerEvent) => {
      if (nativeEvent.pointerId !== pressPointerIdRef.current) return;
      document.removeEventListener("pointerup", finish, true);
      document.removeEventListener("pointercancel", finish, true);
      finishPressRef.current = null;
      pressPointerIdRef.current = null;
      useSelectionStore.getState().setDraggingIds([]);
    };

    if (finishPressRef.current) {
      document.removeEventListener("pointerup", finishPressRef.current, true);
      document.removeEventListener("pointercancel", finishPressRef.current, true);
    }
    finishPressRef.current = finish;
    document.addEventListener("pointerup", finish, true);
    document.addEventListener("pointercancel", finish, true);
  };

  const isLocked = (item.props as { locked?: boolean }).locked === true;
  const isSelected = useSelectionStore((state) => state.selectedIds.includes(item.id));

  const disableInteraction = isDrawingMode;
  // A lock always wins over the per-type flags the canvas passes in.
  const draggingDisabled = isLocked || (disableDragging ?? (disableInteraction || isRotating));
  const resizingEnabled = !isLocked && (enableResizing ?? !disableInteraction);

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

  // Coarse pointers (touch) get larger rotate zones; AFFiNE's 12 px suits a mouse.
  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarsePointer(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  /** Delete button size in world units (p-1 + 12px icon at the 14px root font). */
  const DELETE_BUTTON_SIZE = 18;
  const rotateZoneWorld = (coarsePointer ? ROTATE_ZONE_COARSE_PX : ROTATE_ZONE_PX) / Math.max(canvasScale, 0.01);
  const deleteButtonOffset = showRotateButton
    ? { top: -(rotateZoneWorld + DELETE_BUTTON_SIZE), right: -(rotateZoneWorld + DELETE_BUTTON_SIZE) }
    : { top: -20, right: -20 };

  const startRotation = (e: React.PointerEvent<HTMLElement>) => {
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
  };

  return (
    <Rnd
      className="workspace-item-rnd"
      size={{ width: item.w, height: item.h }}
      // react-rnd uses `scale` to normalize pointer deltas; it does not
      // scale the controlled position prop. Keep position in workspace units,
      // matching SelectionOverlay and the parent TransformComponent.
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
        dragCancelledRef.current = isMultiTouchNavigating();
        const { selectedIds, setDraggingIds } = useSelectionStore.getState();
        const { items } = useWorkspaceStore.getState();
        setDraggingIds(selectedIds.includes(item.id) ? selectedIds : [item.id]);

        if (selectedIds.includes(item.id)) {
          const snapshot = snapshotGroupMove(items, selectedIds);
          dragStartPositionsRef.current = snapshot.positions;
          dragConnectorPropsRef.current = snapshot.connectors;
        } else {
          dragStartPositionsRef.current = new Map([[item.id, { x: item.x, y: item.y }]]);
          dragConnectorPropsRef.current = new Map();
        }
      }}
      onDrag={(e, d) => {
        const { selectedIds } = useSelectionStore.getState();
        const startPos = dragStartPositionsRef.current.get(item.id);
        if (!startPos) return;

        let dx = d.x - startPos.x;
        let dy = d.y - startPos.y;

        // A second finger turned this into a two-finger pan / pinch: the item stays put.
        if (isMultiTouchNavigating()) dragCancelledRef.current = true;
        if (dragCancelledRef.current) {
          dx = 0;
          dy = 0;
        }

        if (item.type === "free-text" && Math.hypot(dx, dy) > 2) {
          dragMovedRef.current = true;
        }

        if (onDrag) {
          const snapped = onDrag(item.id, startPos.x + dx, startPos.y + dy);
          dx = snapped.x - startPos.x;
          dy = snapped.y - startPos.y;
        }

        if (selectedIds.includes(item.id)) {
          useWorkspaceStore.getState().batchUpdateItems(groupMoveUpdates({
            positions: dragStartPositionsRef.current,
            connectors: dragConnectorPropsRef.current,
          }, dx, dy));
        } else {
          updateItem(item.id, { x: startPos.x + dx, y: startPos.y + dy });
        }
      }}
      onDragStop={(e, d) => {
        const { selectedIds, setDraggingIds } = useSelectionStore.getState();
        const startPos = dragStartPositionsRef.current.get(item.id);
        if (!startPos) {
          setDraggingIds([]);
          return;
        }

        // A press can start an Rnd gesture without ever becoming a drag.
        // In particular, a touch used to dismiss a text editor can end outside
        // the item and still trigger onDragStop. Never commit that end position.
        const didMove = item.type !== "free-text" || dragMovedRef.current;
        dragMovedRef.current = false;
        if (!didMove) {
          dragStartPositionsRef.current = new Map();
          setDraggingIds([]);
          onDragStop?.();
          return;
        }

        let dx = d.x - startPos.x;
        let dy = d.y - startPos.y;

        if (onDrag && !dragCancelledRef.current) {
          const snapped = onDrag(item.id, startPos.x + dx, startPos.y + dy);
          dx = snapped.x - startPos.x;
          dy = snapped.y - startPos.y;
        }
        if (dragCancelledRef.current) {
          dx = 0;
          dy = 0;
        }
        dragCancelledRef.current = false;

        if (selectedIds.includes(item.id)) {
          useWorkspaceStore.getState().batchUpdateItems(groupMoveUpdates({
            positions: dragStartPositionsRef.current,
            connectors: dragConnectorPropsRef.current,
          }, dx, dy));
        } else {
          updateItem(item.id, { x: startPos.x + dx, y: startPos.y + dy });
        }
        dragStartPositionsRef.current = new Map();
        setDraggingIds([]);
        if (onDragStop) {
          onDragStop();
        }
      }}
      onResize={(e, direction, ref, delta, position) => {
        updateItem(item.id, {
          x: position.x,
          y: position.y,
          w: parseInt(ref.style.width),
          h: parseInt(ref.style.height),
        });
      }}
      onResizeStop={(e, direction, ref, delta, position) => {
        const newSize = { w: parseInt(ref.style.width), h: parseInt(ref.style.height) };
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
        onPointerDown={handleItemPointerDown}
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
            {ROTATE_CORNERS.map((corner) => {
              const box = getRotateZoneBox(corner, item.w, item.h, coarsePointer ? ROTATE_ZONE_COARSE_PX : ROTATE_ZONE_PX, canvasScale);
              return (
                // AFFiNE-style rotation: an invisible zone just outside each
                // corner (resize handles stay on top where they overlap).
                <div
                  key={corner}
                  role="button"
                  aria-label={`Rotate from ${corner}`}
                  data-rotate-corner={corner}
                  data-no-canvas-gesture="true"
                  title="Drag to rotate"
                  onPointerDown={startRotation}
                  className="pointer-events-auto absolute touch-none"
                  style={{ ...box, ["--rotate-cursor" as string]: getRotateCursor(corner, item.rotation ?? 0) } as React.CSSProperties}
                />
              );
            })}
          </div>
        )}

        {isLocked && isSelected && (
          // Constant on-screen size at any zoom, just above the top-left corner.
          <div
            aria-label="Locked"
            title="Locked"
            data-element-lock-badge={item.id}
            className="pointer-events-none absolute z-30 flex items-center justify-center rounded-full bg-white text-red-500 shadow-sm ring-1 ring-red-300"
            style={{
              left: 0,
              bottom: "100%",
              width: 18,
              height: 18,
              marginBottom: 4 / Math.max(canvasScale, 0.01),
              transform: `scale(${1 / Math.max(canvasScale, 0.01)})`,
              transformOrigin: "bottom left",
            }}
          >
            <Lock className="h-2.5 w-2.5" />
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
            className="pointer-events-auto absolute z-30 opacity-0 group-hover:opacity-100 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-opacity shadow-md"
            // With corner rotate zones shown, sit diagonally just past the
            // top-right zone so both stay reachable; otherwise keep -20px.
            style={deleteButtonOffset}
          >
            <X className="w-3 h-3 text-white" />
          </button>
        )}


      </div>
    </Rnd>
  );
}
