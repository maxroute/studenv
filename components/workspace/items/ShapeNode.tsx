// ---------------------------------------------------------------------------
// Shape Tool – Shape rendering component (Professional Standard)
// ---------------------------------------------------------------------------

"use client";

import React from "react";
import type { ShapeNode as ShapeNodeType } from "@/types/workspace";
import { getShapePath, getStrokeDashArray } from "@/lib/workspace/shape-paths";

interface ShapeNodeProps {
  item: ShapeNodeType;
  isSelected?: boolean;
}

/**
 * Calculates points for a mathematically correct arrowhead at the vector endpoint.
 */
function getArrowheadPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidth: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len < 1) {
    return {
      shaftEndX: x2,
      shaftEndY: y2,
      points: "",
    };
  }

  // Adjust arrowhead size based on stroke width
  const headLength = Math.max(12, Math.min(24, strokeWidth * 6));
  const headWidth = Math.max(6, Math.min(12, strokeWidth * 3));

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

export const ShapeNode = React.memo(function ShapeNode({
  item,
  isSelected = false,
}: ShapeNodeProps) {
  const { kind, fill, stroke, cornerRadius, opacity, shadow } = item.props;
  const strokeDasharray = getStrokeDashArray(stroke.style, stroke.width);

  // Fill opacity: mute slightly when selected to avoid competing with selection outline
  const baseFillOpacity = fill.type === "transparent" ? 0 : 1;
  const fillOpacity = isSelected ? baseFillOpacity * 0.8 : baseFillOpacity;

  // SVG filter reference for shadows (defined globally in canvas.tsx)
  const filterAttr = shadow ? "url(#studenv-shadow)" : undefined;

  // Vector coordinates for lines and arrows
  const hasVectorEndpoints = item.props.startPoint && item.props.endPoint;
  const x1 = hasVectorEndpoints ? item.props.startPoint!.x - item.x : 0;
  const y1 = hasVectorEndpoints ? item.props.startPoint!.y - item.y : item.h / 2;
  const x2 = hasVectorEndpoints ? item.props.endPoint!.x - item.x : item.w;
  const y2 = hasVectorEndpoints ? item.props.endPoint!.y - item.y : item.h / 2;

  if (kind === "line") {
    return (
      <div
        className="w-full h-full p-0 m-0 select-none overflow-visible"
        style={{
          opacity: opacity / 100,
          transition: "opacity 0.2s ease-out",
        }}
      >
        <svg
          className="w-full h-full block p-0 m-0 overflow-visible"
          style={{ pointerEvents: "none" }}
        >
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
            filter={filterAttr}
            style={{ pointerEvents: "stroke" }}
            className={`drag-handle transition-colors duration-150 ${
              isSelected ? "cursor-move" : "cursor-move"
            }`}
          />
        </svg>
      </div>
    );
  }

  if (kind === "arrow") {
    const arrow = getArrowheadPoints(x1, y1, x2, y2, stroke.width);
    return (
      <div
        className="w-full h-full p-0 m-0 select-none overflow-visible"
        style={{
          opacity: opacity / 100,
          transition: "opacity 0.2s ease-out",
        }}
      >
        <svg
          className="w-full h-full block p-0 m-0 overflow-visible"
          style={{ pointerEvents: "none" }}
        >
          <g filter={filterAttr}>
            <line
              x1={x1}
              y1={y1}
              x2={arrow.shaftEndX}
              y2={arrow.shaftEndY}
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeDasharray={strokeDasharray}
              strokeLinecap="round"
              style={{ pointerEvents: "stroke" }}
              className={`drag-handle transition-colors duration-150 ${
                isSelected ? "cursor-move" : "cursor-move"
              }`}
            />
            {arrow.points && (
              <polygon
                points={arrow.points}
                fill={stroke.color}
                stroke={stroke.color}
                strokeWidth={1}
                strokeLinejoin="round"
                style={{ pointerEvents: "fill" }}
                className={`drag-handle transition-colors duration-150 ${
                  isSelected ? "cursor-move" : "cursor-move"
                }`}
              />
            )}
          </g>
        </svg>
      </div>
    );
  }

  // General closed vector shapes
  return (
    <div
      className="w-full h-full p-0 m-0 select-none overflow-visible"
      style={{
        opacity: opacity / 100,
        transition: "opacity 0.2s ease-out",
      }}
    >
      <svg
        className="w-full h-full block p-0 m-0 overflow-visible"
        style={{ pointerEvents: "none" }}
      >
        <path
          d={getShapePath(kind, item.w, item.h, cornerRadius)}
          fill={fill.color}
          fillOpacity={fillOpacity}
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeDasharray={strokeDasharray}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={filterAttr}
          style={{ pointerEvents: "visiblePainted" }}
          className={`drag-handle transition-colors duration-150 ${
            isSelected ? "cursor-move" : "cursor-move"
          }`}
        />
      </svg>
    </div>
  );
});
