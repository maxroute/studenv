"use client";

import { useState, useRef, useEffect } from "react";
import {
  Pen,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Minus,
  Plus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export type DrawTool = "pen" | "eraser";

interface DrawingToolbarProps {
  activeTool: DrawTool;
  onToolChange: (tool: DrawTool) => void;
  strokeWidth: number;
  onStrokeWidthChange: (w: number) => void;
  color: string;
  onColorChange: (c: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearAll: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

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

const MIN_STROKE = 1;
const MAX_STROKE = 20;

export function DrawingToolbar({
  activeTool,
  onToolChange,
  strokeWidth,
  onStrokeWidthChange,
  color,
  onColorChange,
  onUndo,
  onRedo,
  onClearAll,
  canUndo,
  canRedo,
}: DrawingToolbarProps) {
  const [showThickness, setShowThickness] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [customColor, setCustomColor] = useState(color);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCustomColor(color);
  }, [color]);

  return (
    <div className="drawing-toolbar">
      <style>{`
        .drawing-toolbar {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1001;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 8px;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.3),
            0 0 0 1px rgba(255, 255, 255, 0.05) inset;
          animation: toolbar-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: visible;
        }

        @keyframes toolbar-slide-up {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }

        .dt-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 10px;
          background: transparent;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .dt-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.9);
        }

        .dt-btn.active {
          background: rgba(99, 102, 241, 0.3);
          color: #a5b4fc;
          box-shadow: 0 0 12px rgba(99, 102, 241, 0.2);
        }

        .dt-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .dt-btn:disabled:hover {
          background: transparent;
          color: rgba(255, 255, 255, 0.6);
        }

        .dt-divider {
          width: 1px;
          height: 24px;
          background: rgba(255, 255, 255, 0.12);
          margin: 0 2px;
        }

        .dt-color-swatch {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.3);
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .dt-color-swatch:hover {
          transform: scale(1.15);
          border-color: rgba(255, 255, 255, 0.7);
        }

        .dt-color-swatch.selected {
          border-color: #a5b4fc;
          box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
        }

        .dt-popup {
          position: absolute;
          bottom: calc(100% + 12px);
          left: 50%;
          transform: translateX(-50%);
          background: rgba(15, 23, 42, 0.92);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          padding: 14px;
          box-shadow:
            0 12px 40px rgba(0, 0, 0, 0.4),
            0 0 0 1px rgba(255, 255, 255, 0.05) inset;
          animation: popup-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 2000;
        }

        @keyframes popup-fade-in {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }

        .dt-thickness-popup {
          width: 200px;
        }

        .dt-colors-popup {
          width: 240px;
        }

        .dt-slider-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .dt-slider {
          flex: 1;
          -webkit-appearance: none;
          appearance: none;
          position:relative;
          min-width: 0;
          height: 22px;
          z-index: 1;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          outline: none;
          margin: 0;
          padding: 0 2px;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.06) inset,
            0 2px 10px rgba(0, 0, 0, 0.18) inset;
        }

        .dt-slider::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 999px;
          background: transparent;
          width:0%;
        }

        .dt-slider::-moz-range-track {
          height: 4px;
          border-radius: 999px;
          background:transparent;
        }
          .dt-slider::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 15%;   /* 👈 adjust this */
  right: 15%;  /* 👈 adjust this */
  height: 4px;
  background: rgba(251, 191, 36, 0.95);
  border-radius: 999px;
  transform: translateY(-50%);
  pointer-events: none;
  z-index:0;
}

        .dt-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #a5b4fc;
          cursor: pointer;
          border: 2px solid rgba(255, 255, 255, 0.3);
          transition: transform 0.15s ease;
          margin-top: -6px;
        }

        .dt-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }

        .dt-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #a5b4fc;
          cursor: pointer;
          border: 2px solid rgba(255, 255, 255, 0.3);
        }

        .dt-slider-label {
          color: rgba(255, 255, 255, 0.7);
          font-size: 11px;
          font-weight: 500;
          min-width: 28px;
          text-align: center;
          font-family: 'Inter', system-ui, sans-serif;
        }

        .dt-preview-row {
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .dt-stroke-preview {
          height: 2px;
          background: #a5b4fc;
          border-radius: 999px;
          transition: all 0.2s ease;
          width: 80%;
        }

        .dt-color-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          margin-bottom: 10px;
        }

        .dt-color-grid-swatch {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          cursor: pointer;
          border: 2px solid transparent;
          transition: all 0.2s ease;
        }

        .dt-color-grid-swatch:hover {
          transform: scale(1.1);
          border-color: rgba(255, 255, 255, 0.4);
        }

        .dt-color-grid-swatch.selected {
          border-color: #a5b4fc;
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);
        }

        .dt-custom-color-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-top: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .dt-custom-color-label {
          color: rgba(255, 255, 255, 0.5);
          font-size: 11px;
          font-family: 'Inter', system-ui, sans-serif;
        }

        .dt-custom-color-input {
          width: 28px;
          height: 28px;
          border: none;
          padding: 0;
          background: none;
          cursor: pointer;
          border-radius: 6px;
          overflow: hidden;
        }

        .dt-custom-color-input::-webkit-color-swatch-wrapper {
          padding: 0;
        }

        .dt-custom-color-input::-webkit-color-swatch {
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
        }

        .dt-active-color {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }

        .dt-active-color:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .dt-btn-group {
          display: flex;
          align-items: center;
          gap: 2px;
        }

        .dt-popup-title {
          color: rgba(255, 255, 255, 0.5);
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
          font-family: 'Inter', system-ui, sans-serif;
        }
      `}</style>

      {/* Tool Selection */}
      <div className="dt-btn-group">
        <button
          className={`dt-btn ${activeTool === "pen" ? "active" : ""}`}
          onClick={() => onToolChange("pen")}
          title="Pen Tool"
        >
          <Pen size={16} />
        </button>
        <button
          className={`dt-btn ${activeTool === "eraser" ? "active" : ""}`}
          onClick={() => onToolChange("eraser")}
          title="Eraser Tool"
        >
          <Eraser size={16} />
        </button>
      </div>

      <div className="dt-divider" />

      {/* Thickness Control */}
      <div style={{ position: "relative" }}>
        <button
          className={`dt-btn ${showThickness ? "active" : ""}`}
          onClick={() => {
            setShowThickness(!showThickness);
            setShowColors(false);
          }}
          title="Brush Thickness"
        >
          <div
            style={{
              width: Math.max(4, Math.min(strokeWidth, 16)),
              height: Math.max(4, Math.min(strokeWidth, 16)),
              borderRadius: "50%",
              background:
                activeTool === "eraser" ? "rgba(255,255,255,0.6)" : color,
              transition: "all 0.2s ease",
            }}
          />
        </button>

        {showThickness && (
          <div className="dt-popup dt-thickness-popup">
            <div className="dt-popup-title">Brush Size</div>
            <div className="dt-slider-row">
              <button
                className="dt-btn"
                style={{ width: 24, height: 24 }}
                onClick={() =>
                  onStrokeWidthChange(Math.max(MIN_STROKE, strokeWidth - 1))
                }
              >
                <Minus size={12} />
              </button>
              <input
                type="range"
                className="dt-slider"
                min={MIN_STROKE}
                max={MAX_STROKE}
                value={strokeWidth}
                onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
              />
              <button
                className="dt-btn"
                style={{ width: 24, height: 24 }}
                onClick={() =>
                  onStrokeWidthChange(Math.min(MAX_STROKE, strokeWidth + 1))
                }
              >
                <Plus size={12} />
              </button>
              <span className="dt-slider-label">{strokeWidth}px</span>
            </div>
            <div className="dt-preview-row">
              <div
                className="dt-stroke-preview"
                style={{
                  height: `${strokeWidth}px`,
                  background:
                    activeTool === "eraser" ? "rgba(255,255,255,0.6)" : color,
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="dt-divider" />

      {/* Color Picker */}
      <div style={{ position: "relative" }}>
        <button
          className="dt-active-color"
          onClick={() => {
            setShowColors(!showColors);
            setShowThickness(false);
          }}
          title="Color"
        >
          <div
            className={`dt-color-swatch ${showColors ? "selected" : ""}`}
            style={{
              background: color,
              border:
                color === "#ffffff"
                  ? "2px solid rgba(255,255,255,0.5)"
                  : undefined,
            }}
          />
        </button>

        {showColors && (
          <div className="dt-popup dt-colors-popup">
            <div className="dt-popup-title">Colors</div>
            <div className="dt-color-grid">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className={`dt-color-grid-swatch ${color === c ? "selected" : ""}`}
                  style={{
                    background: c,
                    border:
                      c === "#ffffff"
                        ? "2px solid rgba(255,255,255,0.4)"
                        : undefined,
                  }}
                  onClick={() => {
                    onColorChange(c);
                    setCustomColor(c);
                  }}
                  title={c}
                />
              ))}
            </div>
            <div className="dt-custom-color-row">
              <span className="dt-custom-color-label">Custom</span>
              <input
                ref={colorInputRef}
                type="color"
                className="dt-custom-color-input"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  onColorChange(e.target.value);
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="dt-divider" />

      {/* Actions */}
      <div className="dt-btn-group">
        <button
          className="dt-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo Last Stroke"
        >
          <Undo2 size={16} />
        </button>
        <button
          className="dt-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
        >
          <Redo2 size={16} />
        </button>
        <button
          className="dt-btn"
          onClick={onClearAll}
          title="Clear All Drawings"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
