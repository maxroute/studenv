"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ArrowUp, Plus } from "lucide-react";
import type { StudioItem } from "@/types/workspace";
import {
  AUTO_COMPLETE_ARROW_MARGIN_PX,
  AUTO_COMPLETE_PREVIEW_DELAY_MS,
  SHAPE_DIRECTIONS,
  STICKY_DIRECTIONS,
  getAutoCompletePositions,
  getConnectedBounds,
  getNextAutoCompleteBound,
  type AutoCompleteDirection,
} from "@/lib/workspace/connector-autocomplete";
import { computeConnectorRoute } from "@/lib/workspace/connector-routing";
import { routeToSvgPath } from "@/lib/workspace/connector-path";
import { getShapePath } from "@/lib/workspace/shape-paths";

export type AutoCompleteSource = Extract<StudioItem, { type: "shape" } | { type: "sticky" }>;

const ICON_ROTATION: Record<AutoCompleteDirection, number> = { top: 0, right: 90, bottom: 180, left: -90 };
const GHOST_ID = "__auto-complete-ghost__";

function arrowCenter(direction: AutoCompleteDirection, w: number, h: number, margin: number) {
  switch (direction) {
    case "right": return { x: w + margin, y: h / 2 };
    case "bottom": return { x: w / 2, y: h + margin };
    case "left": return { x: -margin, y: h / 2 };
    case "top": return { x: w / 2, y: -margin };
  }
}

/**
 * AFFiNE auto-complete arrows around a selected shape (4) or sticky note
 * (right/left). Hover shows the next-shape ghost after 300 ms; press-and-drag
 * starts a connector; a click creates the next object.
 */
export function ConnectorAutoCompleteArrows({
  source,
  rotation,
  items,
  zoom,
  onArrowPointerDown,
}: {
  source: AutoCompleteSource;
  /** Effective rotation (follows live rotate previews). */
  rotation: number;
  items: readonly StudioItem[];
  zoom: number;
  onArrowPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, direction: AutoCompleteDirection) => void;
}) {
  const [ghostDirection, setGhostDirection] = useState<AutoCompleteDirection | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isShape = source.type === "shape";
  const directions = isShape ? SHAPE_DIRECTIONS : STICKY_DIRECTIONS;
  const scale = 1 / Math.max(zoom, 0.01);
  const margin = AUTO_COMPLETE_ARROW_MARGIN_PX * scale;

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => () => clearTimer(), []);
  useEffect(() => {
    clearTimer();
    setGhostDirection(null);
  }, [source.id]);

  // Ghost of the next shape and its elbow connector (shapes only, like AFFiNE).
  let ghost: { path: string; transform: string; line: string | null; stroke: string } | null = null;
  if (isShape && ghostDirection && source.type === "shape") {
    const bound = getNextAutoCompleteBound(ghostDirection, { ...source, rotation }, getConnectedBounds(source.id, items));
    const ghostItem = { ...source, id: GHOST_ID, x: bound.x, y: bound.y, rotation } as StudioItem;
    const { start, end } = getAutoCompletePositions(ghostDirection);
    const route = computeConnectorRoute(
      { mode: "elbow", source: { id: source.id, position: start }, target: { id: GHOST_ID, position: end } },
      [...items.filter((item) => item.id !== source.id), { ...source, rotation } as StudioItem, ghostItem],
    );
    ghost = {
      path: getShapePath(source.props.kind, bound.w, bound.h, source.props.cornerRadius),
      transform: `translate(${bound.x} ${bound.y}) rotate(${rotation} ${bound.w / 2} ${bound.h / 2})`,
      line: route ? routeToSvgPath(route) : null,
      stroke: source.props.stroke?.color ?? "#6366f1",
    };
  }

  return (
    <>
      {ghost && (
        <svg aria-hidden="true" data-auto-complete-ghost="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" style={{ zIndex: 1150 }}>
          <path d={ghost.path} transform={ghost.transform} fill="none" stroke={ghost.stroke} strokeWidth={1.5 * scale} strokeDasharray={`${4 * scale} ${4 * scale}`} />
          {ghost.line && <path d={ghost.line} fill="none" stroke={ghost.stroke} strokeWidth={1.5 * scale} strokeDasharray={`${4 * scale} ${4 * scale}`} />}
        </svg>
      )}
      <div
        aria-label="Auto-complete connectors"
        className="pointer-events-none absolute"
        style={{
          left: source.x,
          top: source.y,
          width: source.w,
          height: source.h,
          transform: `rotate(${rotation}deg)`,
          transformOrigin: "center",
          zIndex: 1200,
        }}
      >
        {directions.map((direction) => {
          const center = arrowCenter(direction, source.w, source.h, margin);
          const Icon = isShape ? ArrowUp : Plus;
          return (
            <button
              key={direction}
              type="button"
              aria-label={`Auto-complete ${direction}`}
              title={isShape ? "Click to add a connected shape, drag to connect" : "Click to add a note, drag to connect"}
              data-auto-complete-direction={direction}
              data-no-canvas-gesture="true"
              onPointerDown={(event) => {
                clearTimer();
                setGhostDirection(null);
                onArrowPointerDown(event, direction);
              }}
              onPointerEnter={(event) => {
                if (event.pointerType !== "mouse" || !isShape) return;
                clearTimer();
                timerRef.current = setTimeout(() => setGhostDirection(direction), AUTO_COMPLETE_PREVIEW_DELAY_MS);
              }}
              onPointerLeave={() => {
                clearTimer();
                setGhostDirection(null);
              }}
              // 44×44 screen-px hit area (touch), 24 px visual arrow; constant at every zoom.
              // Explicit px sizes: Tailwind spacing is rem-based and the app's root font is 14px.
              className="group pointer-events-auto absolute flex items-center justify-center touch-none"
              style={{ left: center.x, top: center.y, width: 44, height: 44, transform: `translate(-50%, -50%) scale(${scale})` }}
            >
              <span
                className="flex items-center justify-center rounded-full border border-transparent text-[#77757d] transition-[background,box-shadow] duration-200 group-hover:border-slate-200 group-hover:bg-white group-hover:shadow-md hover:!border-white/10 hover:!bg-[#1e96eb] hover:!text-white"
                style={{ width: 24, height: 24, transform: isShape ? `rotate(${ICON_ROTATION[direction]}deg)` : undefined }}
              >
                <Icon size={16} strokeWidth={2.25} />
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
