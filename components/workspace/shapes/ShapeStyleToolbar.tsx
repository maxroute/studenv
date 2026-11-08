// ---------------------------------------------------------------------------
// Shape Tool – Floating Styling Toolbar (Notion-Dark / Raycast Style)
// ---------------------------------------------------------------------------

"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import type { ShapeNode } from "@/types/workspace";
import {
  Paintbrush,
  Sliders,
  Sparkles,
  Lock,
  Unlock,
} from "lucide-react";

const PRESET_COLORS = [
  "#1e1e1e", // near-black
  "#f43f5e", // rose
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#6366f1", // indigo
  "#a855f7", // purple
  "#ec4899", // pink
  "#ffffff", // white
];

// Toolbar dimensions for clamping
const TOOLBAR_WIDTH = 320;
const TOOLBAR_HEIGHT_EST = 200;
const TOOLBAR_GAP = 12;
const VIEWPORT_PADDING = 8;

export function ShapeStyleToolbar() {
  const { selectedIds } = useSelectionStore();
  const { items, viewport, updateItemProps } = useWorkspaceStore();
  const [activeTab, setActiveTab] = useState<"fill" | "stroke" | "effects">("stroke");
  const toolbarRef = useRef<HTMLDivElement>(null);

  const selectedShapes = items.filter(
    (item): item is ShapeNode => selectedIds.includes(item.id) && item.type === "shape"
  );

  // Compute bounding box of all selected shapes in world coordinates
  const selectionBounds = useMemo(() => {
    if (selectedShapes.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of selectedShapes) {
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + s.w);
      maxY = Math.max(maxY, s.y + s.h);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }, [selectedShapes]);

  // Project world coordinates → screen coordinates using viewport transform
  const toolbarPosition = useMemo(() => {
    if (!selectionBounds) return null;

    const canvasEl = document.querySelector("[data-workspace-canvas]");
    if (!canvasEl) return null;
    const canvasRect = canvasEl.getBoundingClientRect();

    // World → screen: screenX = worldX * zoom + panX + canvasLeft
    const screenCenterX = selectionBounds.x * viewport.zoom + viewport.x + canvasRect.left + (selectionBounds.w * viewport.zoom) / 2;
    const screenTopY = selectionBounds.y * viewport.zoom + viewport.y + canvasRect.top;
    const screenBottomY = screenTopY + selectionBounds.h * viewport.zoom;

    let left = screenCenterX - TOOLBAR_WIDTH / 2;
    let top = screenTopY - TOOLBAR_HEIGHT_EST - TOOLBAR_GAP;

    // If toolbar would go above viewport, snap below selection
    if (top < VIEWPORT_PADDING) {
      top = screenBottomY + TOOLBAR_GAP;
    }

    // Clamp horizontally
    left = Math.max(VIEWPORT_PADDING, Math.min(left, window.innerWidth - TOOLBAR_WIDTH - VIEWPORT_PADDING));

    // Clamp vertically (bottom edge)
    if (top + TOOLBAR_HEIGHT_EST > window.innerHeight - VIEWPORT_PADDING) {
      top = window.innerHeight - TOOLBAR_HEIGHT_EST - VIEWPORT_PADDING;
    }

    return { left, top };
  }, [selectionBounds, viewport]);

  // Individual styling controls must not compete with group manipulation.
  if (selectedIds.length !== 1 || selectedShapes.length !== 1 || !toolbarPosition) return null;

  const firstShapeProps = selectedShapes[0].props as any;
  const isAllLocked = selectedShapes.every((s) => s.props.locked);

  const handlePropChange = (key: string, value: any) => {
    selectedShapes.forEach((shape) => {
      updateItemProps(shape.id, { [key]: value });
    });
  };

  const handleFillColorChange = (color: string) => {
    selectedShapes.forEach((shape) => {
      const currentFill = shape.props.fill;
      updateItemProps(shape.id, {
        fill: { ...currentFill, color },
      });
    });
  };

  const handleFillTypeChange = (type: "solid" | "transparent") => {
    selectedShapes.forEach((shape) => {
      const currentFill = shape.props.fill;
      updateItemProps(shape.id, {
        fill: { ...currentFill, type },
      });
    });
  };

  const handleStrokeChange = (updates: any) => {
    selectedShapes.forEach((shape) => {
      const currentStroke = shape.props.stroke;
      updateItemProps(shape.id, {
        stroke: { ...currentStroke, ...updates },
      });
    });
  };

  const handleLockToggle = () => {
    selectedShapes.forEach((shape) => {
      updateItemProps(shape.id, { locked: !isAllLocked });
    });
  };

  const showCornerRadius = selectedShapes.some(
    (s) => s.props.kind === "rounded-rectangle"
  );

  // Accent active class helper
  const tabActive = (tab: string) =>
    activeTab === tab
      ? "text-[#f5a623] bg-white/[0.06] font-semibold"
      : "text-[#8a8f98] hover:text-[#c8ccd4]";

  const toggleActive = (isOn: boolean, onClass: string, offClass: string) =>
    isOn ? onClass : offClass;

  return (
    <div
      ref={toolbarRef}
      data-shape-style-toolbar="true"
      className="fixed z-[1200] flex flex-col rounded-2xl p-3 text-white max-w-[320px] w-full select-none gap-3 transition-all duration-200 ease-out animate-in fade-in slide-in-from-bottom-2"
      style={{
        left: toolbarPosition.left,
        top: toolbarPosition.top,
        background: "#1B1D22",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.2)",
      }}
    >
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
        <div className="flex gap-0.5">
          <button
            onClick={() => setActiveTab("fill")}
            className={`p-1.5 rounded-lg transition-colors ${tabActive("fill")}`}
            title="Fill Styles"
          >
            <Paintbrush size={15} />
          </button>
          <button
            onClick={() => setActiveTab("stroke")}
            className={`p-1.5 rounded-lg transition-colors ${tabActive("stroke")}`}
            title="Stroke Styles"
          >
            <Sliders size={15} />
          </button>
          <button
            onClick={() => setActiveTab("effects")}
            className={`p-1.5 rounded-lg transition-colors ${tabActive("effects")}`}
            title="Opacity & Shadow"
          >
            <Sparkles size={15} />
          </button>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleLockToggle}
            className={`p-1.5 rounded-lg transition-colors ${
              isAllLocked ? "text-[#f5a623] bg-[#f5a623]/10" : "text-[#8a8f98] hover:text-[#c8ccd4] hover:bg-white/[0.06]"
            }`}
            title={isAllLocked ? "Unlock Shape" : "Lock Shape"}
          >
            {isAllLocked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
        </div>
      </div>

      {/* Styles Content */}
      <div className="min-h-[90px] flex flex-col justify-center">
        {activeTab === "fill" && (
          <div className="flex flex-col gap-3">
            {/* Fill Mode */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#8a8f98] uppercase tracking-wider">Fill Mode</span>
              <div className="bg-white/[0.04] p-0.5 rounded-lg flex">
                <button
                  onClick={() => handleFillTypeChange("solid")}
                  className={`px-2.5 py-1 rounded text-xs transition-all ${
                    firstShapeProps.fill.type === "solid" ? "bg-[#f5a623] text-[#1B1D22] font-semibold" : "text-[#8a8f98] hover:text-white"
                  }`}
                >
                  Solid
                </button>
                <button
                  onClick={() => handleFillTypeChange("transparent")}
                  className={`px-2.5 py-1 rounded text-xs transition-all ${
                    firstShapeProps.fill.type === "transparent" ? "bg-[#f5a623] text-[#1B1D22] font-semibold" : "text-[#8a8f98] hover:text-white"
                  }`}
                >
                  None
                </button>
              </div>
            </div>

            {/* Colors Grid */}
            {firstShapeProps.fill.type === "solid" && (
              <div className="grid grid-cols-5 gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={`fill-${c}`}
                    onClick={() => handleFillColorChange(c)}
                    className={`h-6 rounded-md border border-white/10 relative transition-transform hover:scale-110 ${
                      firstShapeProps.fill.color === c ? "ring-2 ring-[#f5a623] scale-105" : ""
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "stroke" && (
          <div className="flex flex-col gap-3">
            {/* Color Grid */}
            <div className="grid grid-cols-5 gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={`stroke-${c}`}
                  onClick={() => handleStrokeChange({ color: c })}
                  className={`h-6 rounded-md border border-white/10 relative transition-transform hover:scale-110 ${
                    firstShapeProps.stroke.color === c ? "ring-2 ring-[#f5a623] scale-105" : ""
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>

            {/* Width and Style */}
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] font-medium text-[#8a8f98] uppercase tracking-wider">Style</span>
              <div className="bg-white/[0.04] p-0.5 rounded-lg flex">
                {(["solid", "dashed", "dotted"] as const).map((style) => (
                  <button
                    key={style}
                    onClick={() => handleStrokeChange({ style })}
                    className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold transition-all ${
                      firstShapeProps.stroke.style === style ? "bg-[#f5a623] text-[#1B1D22]" : "text-[#8a8f98] hover:text-white"
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-[11px] font-medium text-[#8a8f98] uppercase tracking-wider">Thickness</span>
                <span className="font-mono text-[#c8ccd4]">{firstShapeProps.stroke.width}px</span>
              </div>
              <input
                type="range"
                min="1"
                max="12"
                value={firstShapeProps.stroke.width}
                onChange={(e) => handleStrokeChange({ width: parseInt(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: "#f5a623" }}
              />
            </div>
          </div>
        )}

        {activeTab === "effects" && (
          <div className="flex flex-col gap-4">
            {/* Opacity */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-[11px] font-medium text-[#8a8f98] uppercase tracking-wider">Opacity</span>
                <span className="font-mono text-[#c8ccd4]">{firstShapeProps.opacity}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={firstShapeProps.opacity}
                onChange={(e) => handlePropChange("opacity", parseInt(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: "#f5a623" }}
              />
            </div>

            {/* Corner Radius (Optional) */}
            {showCornerRadius && (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[11px] font-medium text-[#8a8f98] uppercase tracking-wider">Rounding</span>
                  <span className="font-mono text-[#c8ccd4]">{firstShapeProps.cornerRadius}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="40"
                  value={firstShapeProps.cornerRadius}
                  onChange={(e) => handlePropChange("cornerRadius", parseInt(e.target.value))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: "#f5a623" }}
                />
              </div>
            )}

            {/* Shadow Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#8a8f98] uppercase tracking-wider">Shadow</span>
              <button
                onClick={() => handlePropChange("shadow", !firstShapeProps.shadow)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                  firstShapeProps.shadow ? "bg-[#f5a623]" : "bg-white/10"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 transform ${
                    firstShapeProps.shadow ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
