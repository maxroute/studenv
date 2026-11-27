// ---------------------------------------------------------------------------
// Shape Tool – Shape rendering component (Professional Standard)
// ---------------------------------------------------------------------------

"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ShapeNode as ShapeNodeType } from "@/types/workspace";
import { getShapePath, getStrokeDashArray } from "@/lib/workspace/shape-paths";
import { shapeHoldsText, shapeTextBox, shapeTextColor } from "@/lib/workspace/shape-text";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";

interface ShapeNodeProps {
  item: ShapeNodeType;
  isSelected?: boolean;
  /** Typing into the shape: its text becomes an input. */
  isEditing?: boolean;
  onFinishEditing?: () => void;
}

const MAX_FONT = 22;
const MIN_FONT = 9;

/**
 * The words inside a shape, laid out in the part of it the outline leaves free
 * and shrunk to fit. While editing, the same box is a text input; the text is
 * saved in the shape's props as it is typed, so it moves and resizes with it.
 */
function ShapeText({ item, isEditing, onFinishEditing }: { item: ShapeNodeType; isEditing: boolean; onFinishEditing?: () => void }) {
  const updateItemProps = useWorkspaceStore((state) => state.updateItemProps);
  const box = shapeTextBox(item.props.kind, item.w, item.h);
  const color = shapeTextColor(item.props.fill, item.props.textColor);
  const text = item.props.text ?? "";
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const shownRef = useRef<HTMLDivElement | null>(null);
  const [fontSize, setFontSize] = useState(MAX_FONT);

  useEffect(() => {
    if (!isEditing) return;
    const input = inputRef.current;
    if (!input) return;
    // The tap that opened typing usually focused the input already, inside the gesture
    // (a phone opens its keyboard only then); focusing it again later can close it.
    if (document.activeElement !== input) input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }, [isEditing]);

  // The largest size at which the words fit inside the shape.
  useLayoutEffect(() => {
    const element = isEditing ? inputRef.current : shownRef.current;
    if (!element) return;
    let size = MAX_FONT;
    element.style.fontSize = `${size}px`;
    while (size > MIN_FONT && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)) {
      size -= 1;
      element.style.fontSize = `${size}px`;
    }
    setFontSize(size);
  }, [text, box.width, box.height, isEditing]);

  if (!isEditing && !text) return null;
  const style: React.CSSProperties = {
    position: "absolute",
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    color,
    fontSize,
    lineHeight: 1.25,
    fontWeight: 500,
    textAlign: "center",
    overflowWrap: "anywhere",
  };

  if (isEditing) {
    return (
      <textarea
        ref={inputRef}
        value={text}
        aria-label="Text in shape"
        placeholder="Type here"
        spellCheck={false}
        onChange={(event) => updateItemProps(item.id, { text: event.target.value.slice(0, 4_000) })}
        onBlur={() => onFinishEditing?.()}
        onKeyDown={(event) => {
          // The board's shortcuts (delete, arrows, undo) must not act while typing.
          event.stopPropagation();
          if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) event.currentTarget.blur();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="resize-none border-0 bg-transparent p-0 outline-none placeholder:text-slate-500/70"
        style={{ ...style, pointerEvents: "auto", display: "block", alignContent: "center", fontFamily: "inherit", touchAction: "manipulation" }}
      />
    );
  }
  return (
    <div
      ref={shownRef}
      // Pressing on the words drags the shape, like pressing on its fill.
      className="drag-handle flex cursor-move select-none items-center justify-center overflow-hidden whitespace-pre-wrap"
      style={{ ...style, pointerEvents: "auto" }}
    >
      <span>{text}</span>
    </div>
  );
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
  isEditing = false,
  onFinishEditing,
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
      className="relative w-full h-full p-0 m-0 select-none overflow-visible"
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
      {shapeHoldsText(kind) ? <ShapeText item={item} isEditing={isEditing} onFinishEditing={onFinishEditing} /> : null}
    </div>
  );
});
