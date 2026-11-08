"use client";

import React, { useState } from "react";
import {
  Minus, MoreHorizontal, Lock, Unlock, Sparkles, Square,
  Check, SlidersHorizontal, Pipette,
} from "lucide-react";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import type { ShapeNode } from "@/types/workspace";

const PRESET_COLORS = [
  "#1e1e1e", "#f43f5e", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#6366f1", "#a855f7", "#ec4899", "#ffffff",
];

type StyleMode = "fill" | "stroke";

function ShapeGlyph({ kind, mode }: { kind: string; mode: StyleMode }) {
  const fill = mode === "fill" ? "#f5a623" : "none";
  const stroke = mode === "stroke" ? "#f5a623" : "#f5a623";
  const common = { fill, stroke, strokeWidth: mode === "stroke" ? 2.2 : 1.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  let shape: React.ReactNode;
  switch (kind) {
    case "circle": shape = <circle cx="12" cy="12" r="8" {...common} />; break;
    case "ellipse": shape = <ellipse cx="12" cy="12" rx="9" ry="6.5" {...common} />; break;
    case "triangle": shape = <path d="M12 3.5 21 20H3Z" {...common} />; break;
    case "diamond": shape = <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" {...common} />; break;
    case "hexagon": shape = <path d="M7 3.5h10l5 8.5-5 8.5H7L2 12Z" {...common} />; break;
    case "pentagon": shape = <path d="m12 2.5 9 6.5-3.5 11h-11L3 9Z" {...common} />; break;
    case "star": shape = <path d="m12 2 2.9 6.2 6.8.8-5 4.7 1.3 6.8-6-3.3-6 3.3 1.2-6.8-5-4.7 6.9-.8Z" {...common} />; break;
    case "arrow": shape = <path d="M3 9h11V4l7 8-7 8v-5H3Z" {...common} />; break;
    case "line": shape = <path d="M3 19 21 5" fill="none" stroke={stroke} strokeWidth="2.5" />; break;
    case "rounded-rectangle": shape = <rect x="3" y="4" width="18" height="16" rx="4" {...common} />; break;
    default: shape = <rect x="3" y="4" width="18" height="16" rx="1.5" {...common} />;
  }
  return <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">{shape}</svg>;
}

function Checkerboard() {
  return <span className="shape-checkerboard" aria-hidden="true" />;
}

export function ShapeStyleToolbar() {
  const { selectedIds } = useSelectionStore();
  const { items, updateItemProps } = useWorkspaceStore();
  const [mode, setMode] = useState<StyleMode>("fill");
  const [moreOpen, setMoreOpen] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [customColor, setCustomColor] = useState("#f5a623");

  const selectedShapes = items.filter(
    (item): item is ShapeNode => selectedIds.includes(item.id) && item.type === "shape"
  );
  if (selectedIds.length !== 1 || selectedShapes.length !== 1) return null;

  const shape = selectedShapes[0];
  const props = shape.props as any;
  const isLocked = !!props.locked;
  const showCornerRadius = props.kind === "rounded-rectangle";

  const updateProp = (key: string, value: any) => updateItemProps(shape.id, { [key]: value });
  const updateFill = (updates: any) => updateItemProps(shape.id, { fill: { ...props.fill, ...updates } });
  const updateStroke = (updates: any) => updateItemProps(shape.id, { stroke: { ...props.stroke, ...updates } });

  const buttonClass = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/65 transition-all hover:bg-white/10 hover:text-white";
  const activeClass = "bg-[#f5a623]/20 text-[#ffc15a] shadow-[0_0_10px_rgba(245,166,35,0.12)]";
  const divider = <span className="mx-1 h-5 w-px shrink-0 bg-white/15" />;

  const colorPopup = (
    <div className="absolute bottom-[calc(100%+12px)] left-1/2 z-[1400] w-60 -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-xl">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-white/50">Colors</div>
      <div className="grid grid-cols-5 gap-2">
        {PRESET_COLORS.map((color) => {
          const selected = mode === "fill" ? props.fill?.type === "solid" && props.fill?.color === color : props.stroke?.color === color;
          return <button key={color} type="button" onClick={() => { if (mode === "fill") updateFill({ color, type: "solid" }); else updateStroke({ color }); setColorsOpen(false); }} aria-label={`Choose ${color}`} title={color} className={`h-8 w-8 rounded-lg border-2 transition-transform hover:scale-105 ${selected ? "border-indigo-300 ring-1 ring-indigo-300/60" : "border-transparent"}`} style={{ backgroundColor: color }} />;
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-white/[0.08] pt-3">
        <span className="text-[11px] text-white/55">Custom</span>
        <input type="color" value={customColor} onChange={(event) => { setCustomColor(event.target.value); if (mode === "fill") updateFill({ color: event.target.value, type: "solid" }); else updateStroke({ color: event.target.value }); }} className="h-7 w-7 cursor-pointer rounded-md border-0 bg-transparent p-0" aria-label="Custom color" />
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        .shape-checkerboard {
          display:inline-block; width:17px; height:17px; border-radius:4px;
          border:1px solid rgba(255,255,255,.38);
          background-color:#d1d5db;
          background-image:linear-gradient(45deg,#737985 25%,transparent 25%),linear-gradient(-45deg,#737985 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#737985 75%),linear-gradient(-45deg,transparent 75%,#737985 75%);
          background-size:8px 8px; background-position:0 0,0 4px,4px -4px,-4px 0;
        }
        .shape-range { appearance:none; -webkit-appearance:none; display:block; width:100%; min-width:0; height:18px; margin:0; padding:0; background:transparent; cursor:pointer; }
        .shape-range::-webkit-slider-runnable-track { height:4px; border-radius:999px; background:rgba(255,255,255,.22); }
        .shape-range::-moz-range-track { height:4px; border-radius:999px; background:rgba(255,255,255,.22); }
        .shape-range::-webkit-slider-thumb { appearance:none; -webkit-appearance:none; width:14px; height:14px; margin-top:-5px; border-radius:50%; background:#f5a623; border:0; }
        .shape-range::-moz-range-thumb { width:14px; height:14px; border:0; border-radius:50%; background:#f5a623; }
      `}</style>
      <div
        data-shape-style-toolbar="true"
        className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] left-1/2 z-[1300] flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-nowrap items-center gap-1 overflow-visible rounded-2xl border border-white/10 bg-slate-900/90 px-2 py-2 text-white shadow-2xl backdrop-blur-xl md:bottom-24"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/[0.06] p-0.5">
          <button type="button" onClick={() => { setMode("fill"); setColorsOpen(false); }} title="Fill" aria-label="Fill" aria-pressed={mode === "fill"} className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${mode === "fill" ? activeClass : "text-white/55 hover:text-white"}`}>
            <ShapeGlyph kind={props.kind} mode="fill" />
          </button>
          <button type="button" onClick={() => { setMode("stroke"); setColorsOpen(false); }} title="Stroke" aria-label="Stroke" aria-pressed={mode === "stroke"} className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${mode === "stroke" ? activeClass : "text-white/55 hover:text-white"}`}>
            <ShapeGlyph kind={props.kind} mode="stroke" />
          </button>
        </div>

        {divider}

        <div className="relative shrink-0">
          <button type="button" onClick={() => { setColorsOpen((open) => !open); setMoreOpen(false); }} title="Choose color" aria-label="Choose color" aria-expanded={colorsOpen} className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${colorsOpen ? activeClass : "text-white/65 hover:bg-white/10"}`}>
            {mode === "fill" && props.fill?.type === "transparent"
              ? <Checkerboard />
              : <span className="h-[19px] w-[19px] rounded-full border-2 border-white/35 shadow-sm" style={{ backgroundColor: mode === "fill" ? props.fill?.color : props.stroke?.color }} />}
          </button>
          {colorsOpen && colorPopup}
        </div>

        {mode === "fill" ? (
          <>
            <button type="button" onClick={() => updateFill({ type: "transparent" })} title="No fill (transparent)" aria-label="No fill (transparent)" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${props.fill?.type === "transparent" ? activeClass : "text-white/60 hover:bg-white/10"}`}>
              <Checkerboard />
            </button>
          </>
        ) : (
          <>
            {divider}
            <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/[0.06] p-0.5">
              {(["solid", "dashed", "dotted"] as const).map((style) => (
                <button key={style} type="button" onClick={() => updateStroke({ style })} title={`${style} line`} aria-label={`${style} line`} className={`flex h-7 w-7 items-center justify-center rounded-full ${props.stroke?.style === style ? activeClass : "text-white/55 hover:text-white"}`}>
                  <svg width="17" height="10" viewBox="0 0 17 10" aria-hidden="true"><line x1="1" y1="5" x2="16" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray={style === "dashed" ? "4 2" : style === "dotted" ? "1 3" : undefined} strokeLinecap="round" /></svg>
                </button>
              ))}
            </div>
            {divider}
            <div className="flex w-32 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.06] px-2">
              <Minus size={12} className="shrink-0 text-white/45" />
              <input aria-label="Stroke width" type="range" min="1" max="12" value={props.stroke?.width ?? 2} onChange={(event) => updateStroke({ width: Number(event.target.value) })} className="shape-range flex-1" />
              <span className="min-w-[2rem] text-center text-[11px] font-medium tabular-nums text-white/75">{props.stroke?.width ?? 2}px</span>
            </div>
          </>
        )}

        {divider}

        <div className="relative shrink-0">
          <button type="button" onClick={() => { setMoreOpen((open) => !open); setColorsOpen(false); }} title="More shape options" aria-label="More shape options" aria-expanded={moreOpen} className={`${buttonClass} ${moreOpen ? activeClass : ""}`}>
            <MoreHorizontal size={18} />
          </button>
          {moreOpen && (
            <div className="absolute bottom-[calc(100%+12px)] right-0 z-[1400] flex w-56 flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between text-xs text-white/70">
                <span className="flex items-center gap-2"><SlidersHorizontal size={14} /> Opacity</span>
                <span className="tabular-nums">{props.opacity ?? 100}%</span>
              </div>
              <input aria-label="Opacity" type="range" min="0" max="100" value={props.opacity ?? 100} onChange={(event) => updateProp("opacity", Number(event.target.value))} className="shape-range" />
              {showCornerRadius && (
                <>
                  <div className="flex items-center justify-between text-xs text-white/70"><span className="flex items-center gap-2"><Square size={14} /> Corner radius</span><span className="tabular-nums">{props.cornerRadius ?? 0}px</span></div>
                  <input aria-label="Corner radius" type="range" min="0" max="40" value={props.cornerRadius ?? 0} onChange={(event) => updateProp("cornerRadius", Number(event.target.value))} className="shape-range" />
                </>
              )}
              <button type="button" onClick={() => updateProp("shadow", !props.shadow)} className="flex items-center justify-between rounded-lg px-1 py-1 text-xs text-white/75 hover:bg-white/5">
                <span className="flex items-center gap-2"><Sparkles size={14} /> Shadow</span>
                <span className={`flex h-5 w-5 items-center justify-center rounded-md ${props.shadow ? "bg-[#f5a623] text-slate-950" : "border border-white/20"}`}>{props.shadow && <Check size={13} />}</span>
              </button>
              <button type="button" onClick={() => updateProp("locked", !isLocked)} className="flex items-center gap-2 rounded-lg px-1 py-1 text-xs text-white/75 hover:bg-white/5">
                {isLocked ? <Unlock size={14} /> : <Lock size={14} />}
                {isLocked ? "Unlock shape" : "Lock shape"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
