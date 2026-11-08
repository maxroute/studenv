"use client";

import React, { useState } from "react";
import {
  Paintbrush, Circle, Minus, MoreHorizontal, Lock, Unlock,
  Sparkles, Square, EyeOff, Check, SlidersHorizontal,
} from "lucide-react";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import type { ShapeNode } from "@/types/workspace";

const PRESET_COLORS = [
  "#1e1e1e", "#f43f5e", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#6366f1", "#a855f7", "#ec4899", "#ffffff",
];

type StyleMode = "fill" | "stroke";

export function ShapeStyleToolbar() {
  const { selectedIds } = useSelectionStore();
  const { items, updateItemProps } = useWorkspaceStore();
  const [mode, setMode] = useState<StyleMode>("fill");
  const [moreOpen, setMoreOpen] = useState(false);

  const selectedShapes = items.filter(
    (item): item is ShapeNode => selectedIds.includes(item.id) && item.type === "shape"
  );

  if (selectedIds.length !== 1 || selectedShapes.length !== 1) return null;

  const shape = selectedShapes[0];
  const props = shape.props as any;
  const isLocked = !!props.locked;
  const showCornerRadius = props.kind === "rounded-rectangle";

  const updateProp = (key: string, value: any) => {
    updateItemProps(shape.id, { [key]: value });
  };
  const updateFill = (updates: any) => {
    updateItemProps(shape.id, { fill: { ...props.fill, ...updates } });
  };
  const updateStroke = (updates: any) => {
    updateItemProps(shape.id, { stroke: { ...props.stroke, ...updates } });
  };

  const buttonClass = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/65 transition-all hover:bg-white/10 hover:text-white";
  const activeClass = "bg-[#f5a623]/20 text-[#ffc15a] shadow-[0_0_10px_rgba(245,166,35,0.12)]";
  const divider = <span className="mx-1 h-5 w-px shrink-0 bg-white/15" />;

  return (
    <div
      data-shape-style-toolbar="true"
      className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] left-1/2 z-[1300] flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-nowrap items-center gap-1 overflow-visible rounded-2xl border border-white/10 bg-slate-900/90 px-2 py-2 text-white shadow-2xl backdrop-blur-xl md:bottom-24"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/[0.06] p-0.5">
        <button type="button" onClick={() => setMode("fill")} title="Fill" aria-label="Fill" aria-pressed={mode === "fill"} className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${mode === "fill" ? activeClass : "text-white/55 hover:text-white"}`}>
          <Paintbrush size={15} />
        </button>
        <button type="button" onClick={() => setMode("stroke")} title="Stroke" aria-label="Stroke" aria-pressed={mode === "stroke"} className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${mode === "stroke" ? activeClass : "text-white/55 hover:text-white"}`}>
          <Circle size={15} />
        </button>
      </div>

      {divider}

      <div className="flex min-w-0 shrink items-center gap-1 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {mode === "fill" ? (
          <>
            {props.fill?.type !== "transparent" && PRESET_COLORS.map((color) => (
              <button key={color} type="button" onClick={() => updateFill({ color, type: "solid" })} aria-label={`Fill ${color}`} title={color} className={`h-[19px] w-[19px] shrink-0 rounded-full border-2 transition-transform hover:scale-110 ${props.fill?.color === color ? "border-[#ffc15a] shadow-[0_0_0_2px_rgba(245,166,35,0.22)]" : "border-white/25"}`} style={{ backgroundColor: color }} />
            ))}
            <button type="button" onClick={() => updateFill({ type: "transparent" })} title="Transparent fill" aria-label="Transparent fill" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${props.fill?.type === "transparent" ? activeClass : "text-white/60 hover:bg-white/10"}`}>
              <EyeOff size={15} />
            </button>
          </>
        ) : (
          <>
            {PRESET_COLORS.map((color) => (
              <button key={color} type="button" onClick={() => updateStroke({ color })} aria-label={`Stroke ${color}`} title={color} className={`h-[19px] w-[19px] shrink-0 rounded-full border-2 transition-transform hover:scale-110 ${props.stroke?.color === color ? "border-[#ffc15a] shadow-[0_0_0_2px_rgba(245,166,35,0.22)]" : "border-white/25"}`} style={{ backgroundColor: color }} />
            ))}
            {divider}
            <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/[0.06] p-0.5">
              {(["solid", "dashed", "dotted"] as const).map((style) => (
                <button key={style} type="button" onClick={() => updateStroke({ style })} title={`${style} line`} aria-label={`${style} line`} className={`flex h-7 w-7 items-center justify-center rounded-full ${props.stroke?.style === style ? activeClass : "text-white/55 hover:text-white"}`}>
                  <svg width="17" height="10" viewBox="0 0 17 10" aria-hidden="true"><line x1="1" y1="5" x2="16" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray={style === "dashed" ? "4 2" : style === "dotted" ? "1 3" : undefined} strokeLinecap="round" /></svg>
                </button>
              ))}
            </div>
            {divider}
            <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.06] px-2">
              <Minus size={12} className="text-white/45" />
              <input aria-label="Stroke width" type="range" min="1" max="12" value={props.stroke?.width ?? 2} onChange={(event) => updateStroke({ width: Number(event.target.value) })} className="h-1 w-14 cursor-pointer accent-[#f5a623]" />
              <span className="min-w-[2rem] text-center text-[11px] font-medium tabular-nums text-white/75">{props.stroke?.width ?? 2}px</span>
              <PlusIcon />
            </div>
          </>
        )}
      </div>

      {divider}

      <div className="relative shrink-0">
        <button type="button" onClick={() => setMoreOpen((open) => !open)} title="More shape options" aria-label="More shape options" aria-expanded={moreOpen} className={`${buttonClass} ${moreOpen ? activeClass : ""}`}>
          <MoreHorizontal size={18} />
        </button>
        {moreOpen && (
          <div className="absolute bottom-[calc(100%+12px)] right-0 z-[1400] flex w-56 flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between text-xs text-white/70">
              <span className="flex items-center gap-2"><SlidersHorizontal size={14} /> Opacity</span>
              <span className="tabular-nums">{props.opacity ?? 100}%</span>
            </div>
            <input aria-label="Opacity" type="range" min="10" max="100" value={props.opacity ?? 100} onChange={(event) => updateProp("opacity", Number(event.target.value))} className="w-full accent-[#f5a623]" />
            {showCornerRadius && (
              <>
                <div className="flex items-center justify-between text-xs text-white/70"><span className="flex items-center gap-2"><Square size={14} /> Corner radius</span><span className="tabular-nums">{props.cornerRadius ?? 0}px</span></div>
                <input aria-label="Corner radius" type="range" min="0" max="40" value={props.cornerRadius ?? 0} onChange={(event) => updateProp("cornerRadius", Number(event.target.value))} className="w-full accent-[#f5a623]" />
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
  );
}

function PlusIcon() {
  return <span className="sr-only">Adjust stroke width</span>;
}
