"use client";

import { DrawingNode as DrawingNodeItem } from "@/types/workspace";

interface DrawingNodeProps {
  item: DrawingNodeItem;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function DrawingNode({ item, isSelected = false, onSelect }: DrawingNodeProps) {
  const pathData =
    item.props.points && item.props.points.length > 1
      ? `M ${item.props.points[0].x} ${item.props.points[0].y} ${item.props.points
          .slice(1)
          .map((point) => `L ${point.x} ${point.y}`)
          .join(" ")}`
      : item.props.d;

  return (
    <div className="w-full h-full pointer-events-none p-0 m-0">
      <svg
        viewBox={`0 0 ${item.w} ${item.h}`}
        className="w-full h-full block p-0 m-0 border-0"
        preserveAspectRatio="none"
        style={{ overflow: "visible" }}
      >
        <path
          d={pathData}
          className={`drag-handle ${isSelected ? "cursor-move" : "cursor-grab"}`}
          stroke={item.props.color}
          strokeWidth={item.props.strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="visibleStroke"
          onPointerDown={() => {
            onSelect?.();
          }}
        />
      </svg>
    </div>
  );
}
