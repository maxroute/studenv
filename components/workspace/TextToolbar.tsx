"use client";

import { Minus, Plus, Type } from "lucide-react";

interface TextToolbarProps {
  color: string;
  onColorChange: (color: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
}

const TEXT_COLORS = ["#1e1e1e", "#ef4444", "#f59e0b", "#22c55e", "#2563eb", "#7c3aed"];
const MIN_SIZE = 18;
const MAX_SIZE = 64;

export function TextToolbar({ color, onColorChange, fontSize, onFontSizeChange }: TextToolbarProps) {
  return (
    <div
      data-text-toolbar="true"
      className="fixed bottom-24 left-1/2 z-[1300] flex items-center gap-3 -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-900/85 px-4 py-3 shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-center gap-2 text-white/80">
        <Type size={16} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Text</span>
      </div>

      <div className="h-6 w-px bg-white/10" />

      <div className="flex items-center gap-2">
        {TEXT_COLORS.map((swatch) => (
          <button
            key={swatch}
            onClick={() => onColorChange(swatch)}
            className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
              color === swatch ? "border-white shadow-[0_0_0_2px_rgba(255,255,255,0.18)]" : "border-white/20"
            }`}
            style={{ backgroundColor: swatch }}
            title={swatch}
          />
        ))}
      </div>

      <div className="h-6 w-px bg-white/10" />

      <div className="flex items-center gap-2 rounded-full bg-white/5 px-2 py-1">
        <button
          onClick={() => onFontSizeChange(Math.max(MIN_SIZE, fontSize - 2))}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          title="Smaller text"
        >
          <Minus size={14} />
        </button>
        <span className="min-w-12 text-center text-sm font-semibold text-white">{fontSize}px</span>
        <button
          onClick={() => onFontSizeChange(Math.min(MAX_SIZE, fontSize + 2))}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          title="Larger text"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
