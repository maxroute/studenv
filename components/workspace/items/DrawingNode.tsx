"use client";

import { DrawingNode as DrawingNodeItem } from "@/types/workspace";
import { createStrokeOutline, outlineToPath } from "@/lib/workspace/drawing-geometry";

interface DrawingNodeProps {
  item: DrawingNodeItem;
  isSelected?: boolean;
  onSelect?: () => void;
  /** Canvas zoom, so the invisible grab area stays about 12 screen px wide. */
  canvasScale?: number;
}

const HIT_WIDTH_SCREEN_PX = 12;

export function DrawingNode({ item, isSelected = false, onSelect, canvasScale = 1 }: DrawingNodeProps) {
  const legacyPath = item.props.points && item.props.points.length > 1
    ? `M ${item.props.points[0].x} ${item.props.points[0].y} ${item.props.points.slice(1).map((point) => `L ${point.x} ${point.y}`).join(" ")}`
    : item.props.d;
  const pathData = item.props.outline
    ? item.props.d
    : legacyPath || outlineToPath(createStrokeOutline(item.props.points ?? [], item.props.strokeWidth));

  return (
    <div className="w-full h-full pointer-events-none p-0 m-0">
      <svg viewBox={`0 0 ${item.w} ${item.h}`} className="w-full h-full block p-0 m-0 border-0" preserveAspectRatio="none" style={{ overflow: "visible" }}>
        {/* Wider invisible grab area so thin strokes are easy to pick and drag. */}
        <path
          d={pathData}
          className="drag-handle cursor-move"
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(item.props.strokeWidth, HIT_WIDTH_SCREEN_PX / Math.max(canvasScale, 0.01))}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="stroke"
          onPointerDown={() => onSelect?.()}
        />
        <path
          d={pathData}
          className={`drag-handle ${isSelected ? "cursor-move" : "cursor-move"}`}
          stroke={item.props.outline ? "none" : item.props.color}
          strokeWidth={item.props.strokeWidth}
          fill={item.props.outline ? item.props.color : "none"}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="visiblePainted"
          onPointerDown={() => onSelect?.()}
        />
      </svg>
    </div>
  );
}
