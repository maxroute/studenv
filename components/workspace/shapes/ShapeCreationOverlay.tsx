// ---------------------------------------------------------------------------
// Shape Tool – Interactive Click-Drag Shape Creation Overlay (Professional Standard)
// ---------------------------------------------------------------------------

"use client";

import React, { useState, useRef, useEffect } from "react";
import type { ShapeKind } from "@/lib/workspace/shape-types";
import { getShapePath } from "@/lib/workspace/shape-paths";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { buildShapeProps, MIN_SHAPE_SIZE } from "@/lib/workspace/shape-engine";
import {
  beginPointerSession,
  clearPointerSession,
  endPointerSession,
  ownsPointerSession,
  type PointerSession,
} from "@/lib/workspace/pointer-session";

export interface ShapePointerHandlers {
  down: (event: React.PointerEvent<HTMLDivElement>) => void;
  move: (event: React.PointerEvent<HTMLDivElement>) => void;
  up: (event: React.PointerEvent<HTMLDivElement>) => void;
  cancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  lostCapture: (event: React.PointerEvent<HTMLDivElement>) => void;
}

interface ShapeCreationOverlayProps {
  activeShapeKind: ShapeKind;
  screenToWorld: (clientX: number, clientY: number) => { x: number; y: number };
  onComplete?: () => void;
  pointerHandlersRef?: React.MutableRefObject<ShapePointerHandlers | null>;
}

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  shiftKey: boolean;
}

/**
 * Calculates points for drawing the preview arrowhead.
 */
function getArrowheadPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len < 1) {
    return { shaftEndX: x2, shaftEndY: y2, points: "" };
  }

  const headLength = Math.max(12, Math.min(20, len * 0.3));
  const headWidth = Math.max(6, Math.min(10, len * 0.15));

  const angle = Math.atan2(dy, dx);
  const xBase = x2 - headLength * Math.cos(angle);
  const yBase = y2 - headLength * Math.sin(angle);

  const x3 = xBase - headWidth * Math.sin(angle);
  const y3 = yBase + headWidth * Math.cos(angle);
  const x4 = xBase + headWidth * Math.sin(angle);
  const y4 = yBase - headWidth * Math.cos(angle);

  return {
    shaftEndX: xBase,
    shaftEndY: yBase,
    points: `${x2},${y2} ${x3},${y3} ${x4},${y4}`,
  };
}

export function ShapeCreationOverlay({
  activeShapeKind,
  screenToWorld,
  onComplete,
  pointerHandlersRef,
}: ShapeCreationOverlayProps) {
  const { addItem } = useWorkspaceStore();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerSessionRef = useRef<PointerSession | null>(null);

  // Handle escape key to cancel drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const session = pointerSessionRef.current;
        if (session) {
          pointerSessionRef.current = endPointerSession(session, { pointerId: session.pointerId });
        }
        setDragState(null);
        if (onComplete) onComplete();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onComplete]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = beginPointerSession(e, e.currentTarget, pointerSessionRef.current);
    if (!session) return;
    pointerSessionRef.current = session;
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    setDragState({
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      shiftKey: e.shiftKey,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ownsPointerSession(pointerSessionRef.current, e) || !dragState) return;
    e.stopPropagation();
    e.preventDefault();
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    setDragState((prev) =>
      prev ? { ...prev, currentX: x, currentY: y, shiftKey: e.shiftKey } : null
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerSessionRef.current;
    if (!ownsPointerSession(session, e)) return;
    pointerSessionRef.current = endPointerSession(session, e);
    if (!dragState) {
      if (onComplete) onComplete();
      return;
    }
    e.stopPropagation();
    e.preventDefault();

    // Pointer-up may be the final movement delivered by the browser. Use its
    // coordinates instead of relying only on the last pointer-move render.
    const releasePoint = screenToWorld(e.clientX, e.clientY);
    const startX = dragState.startX;
    const startY = dragState.startY;
    const currentX = releasePoint.x;
    const currentY = releasePoint.y;
    const shiftKey = dragState.shiftKey || e.shiftKey;
    setDragState(null);

    let startXVal = startX;
    let startYVal = startY;
    let currentXVal = currentX;
    let currentYVal = currentY;

    // Apply constraints
    const isLine = activeShapeKind === "line" || activeShapeKind === "arrow";
    if (isLine) {
      if (shiftKey || e.shiftKey) {
        const dx = currentX - startX;
        const dy = currentY - startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const roundedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        currentXVal = startX + dist * Math.cos(roundedAngle);
        currentYVal = startY + dist * Math.sin(roundedAngle);
      }
    } else {
      let w = Math.abs(currentX - startX);
      let h = Math.abs(currentY - startY);
      if (activeShapeKind === "circle" || activeShapeKind === "star" || activeShapeKind === "pentagon" || activeShapeKind === "hexagon" || shiftKey || e.shiftKey) {
        const size = Math.min(w, h);
        w = size;
        h = size;
        if (currentX < startX) {
          currentXVal = startX - size;
        } else {
          currentXVal = startX + size;
        }
        if (currentY < startY) {
          currentYVal = startY - size;
        } else {
          currentYVal = startY + size;
        }
      }
    }

    let finalW = Math.max(1, Math.abs(currentXVal - startXVal));
    let finalH = Math.max(1, Math.abs(currentYVal - startYVal));
    let finalX = Math.min(startXVal, currentXVal);
    let finalY = Math.min(startYVal, currentYVal);

    // Filter tiny clicks to avoid creating zero-size elements
    const dist = Math.sqrt(
      (currentXVal - startXVal) ** 2 + (currentYVal - startYVal) ** 2
    );
    if (dist < MIN_SHAPE_SIZE) {
      if (onComplete) onComplete();
      return;
    }

    // Build shape payload
    const shapeProps: any = {
      w: finalW,
      h: finalH,
    };

    if (isLine) {
      const pad = 16;
      finalX -= pad;
      finalY -= pad;
      finalW += pad * 2;
      finalH += pad * 2;
      shapeProps.w = finalW;
      shapeProps.h = finalH;
      shapeProps.startPoint = { x: startXVal, y: startYVal };
      shapeProps.endPoint = { x: currentXVal, y: currentYVal };
    }

    const createdProps = buildShapeProps(activeShapeKind, shapeProps);
    addItem("shape", createdProps, { x: finalX, y: finalY });

    if (onComplete) {
      onComplete();
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerSessionRef.current;
    if (!ownsPointerSession(session, e)) return;
    pointerSessionRef.current = endPointerSession(session, e);
    setDragState(null);
    if (onComplete) {
      onComplete();
    }
  };

  const handleLostPointerCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerSessionRef.current;
    if (!ownsPointerSession(session, e)) return;
    pointerSessionRef.current = clearPointerSession(session, e);
    setDragState(null);
    if (onComplete) {
      onComplete();
    }
  };

  if (pointerHandlersRef) {
    pointerHandlersRef.current = {
      down: handlePointerDown,
      move: handlePointerMove,
      up: handlePointerUp,
      cancel: handlePointerCancel,
      lostCapture: handleLostPointerCapture,
    };
  }

  // Live preview calculations
  let previewComponent = null;

  if (dragState) {
    const { startX, startY, currentX, currentY, shiftKey } = dragState;
    let startXVal = startX;
    let startYVal = startY;
    let currentXVal = currentX;
    let currentYVal = currentY;

    const isLine = activeShapeKind === "line" || activeShapeKind === "arrow";

    if (isLine) {
      if (shiftKey) {
        const dx = currentX - startX;
        const dy = currentY - startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const roundedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        currentXVal = startX + dist * Math.cos(roundedAngle);
        currentYVal = startY + dist * Math.sin(roundedAngle);
      }
    } else {
      let w = Math.abs(currentX - startX);
      let h = Math.abs(currentY - startY);
      if (activeShapeKind === "circle" || activeShapeKind === "star" || activeShapeKind === "pentagon" || activeShapeKind === "hexagon" || shiftKey) {
        const size = Math.min(w, h);
        w = size;
        h = size;
        if (currentX < startX) {
          currentXVal = startX - size;
        } else {
          currentXVal = startX + size;
        }
        if (currentY < startY) {
          currentYVal = startY - size;
        } else {
          currentYVal = startY + size;
        }
      }
    }

    const previewW = Math.max(1, Math.abs(currentXVal - startXVal));
    const previewH = Math.max(1, Math.abs(currentYVal - startYVal));
    const previewX = Math.min(startXVal, currentXVal);
    const previewY = Math.min(startYVal, currentYVal);

    if (activeShapeKind === "line") {
      previewComponent = (
        <line
          x1={startXVal}
          y1={startYVal}
          x2={currentXVal}
          y2={currentYVal}
          stroke="#6366f1"
          strokeWidth={2}
          strokeDasharray="4 4"
          strokeLinecap="round"
        />
      );
    } else if (activeShapeKind === "arrow") {
      const arrow = getArrowheadPoints(startXVal, startYVal, currentXVal, currentYVal);
      previewComponent = (
        <g>
          <line
            x1={startXVal}
            y1={startYVal}
            x2={arrow.shaftEndX}
            y2={arrow.shaftEndY}
            stroke="#6366f1"
            strokeWidth={2}
            strokeDasharray="4 4"
            strokeLinecap="round"
          />
          {arrow.points && (
            <polygon
              points={arrow.points}
              fill="rgba(99, 102, 241, 0.2)"
              stroke="#6366f1"
              strokeWidth={1}
              strokeLinejoin="round"
            />
          )}
        </g>
      );
    } else if (activeShapeKind === "circle") {
      previewComponent = (
        <circle
          cx={previewX + previewW / 2}
          cy={previewY + previewH / 2}
          r={previewW / 2}
          fill="rgba(99, 102, 241, 0.08)"
          stroke="#6366f1"
          strokeWidth={2}
          strokeDasharray="4 4"
        />
      );
    } else if (activeShapeKind === "ellipse") {
      previewComponent = (
        <ellipse
          cx={previewX + previewW / 2}
          cy={previewY + previewH / 2}
          rx={previewW / 2}
          ry={previewH / 2}
          fill="rgba(99, 102, 241, 0.08)"
          stroke="#6366f1"
          strokeWidth={2}
          strokeDasharray="4 4"
        />
      );
    } else {
      // General polygon / path preview
      const previewPath = getShapePath(
        activeShapeKind,
        previewW,
        previewH,
        activeShapeKind === "rounded-rectangle" ? 12 : 0
      );
      previewComponent = (
        <path
          transform={`translate(${previewX}, ${previewY})`}
          d={previewPath}
          fill="rgba(99, 102, 241, 0.08)"
          stroke="#6366f1"
          strokeWidth={2}
          strokeDasharray="4 4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }
  }

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 select-none cursor-crosshair z-[10000] bg-transparent"
        style={{ touchAction: "none", pointerEvents: "none" }}
      />
      {dragState && previewComponent && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-[10001]">
          {previewComponent}
        </svg>
      )}
    </>
  );
}
