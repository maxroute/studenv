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
      className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] left-1/2 z-[1300] flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-2xl border border-white/10 bg-slate-900/85 px-2 py-2 shadow-2xl backdrop-blur-xl sm:gap-3 sm:px-4 sm:py-3 md:bottom-24"
    >
      <div className="flex shrink-0 items-center gap-1 text-white/80 sm:gap-2">
        <Type size={14} className="sm:h-4 sm:w-4" />
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] sm:text-[11px] sm:tracking-[0.18em]">Text</span>
      </div>

      <div className="h-5 w-px shrink-0 bg-white/10 sm:h-6" />

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {TEXT_COLORS.map((swatch) => (
          <button
            key={swatch}
            onClick={() => onColorChange(swatch)}
            className={`h-[18px] w-[18px] shrink-0 rounded-full border-2 transition-transform hover:scale-110 sm:h-6 sm:w-6 ${
              color === swatch ? "border-white shadow-[0_0_0_2px_rgba(255,255,255,0.18)]" : "border-white/20"
            }`}
            style={{ backgroundColor: swatch }}
            title={swatch}
          />
        ))}
      </div>

      <div className="h-5 w-px shrink-0 bg-white/10 sm:h-6" />

      <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/5 px-1 py-0.5 sm:gap-2 sm:px-2 sm:py-1">
        <button
          onClick={() => onFontSizeChange(Math.max(MIN_SIZE, fontSize - 2))}
          className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:h-8 sm:w-8"
          title="Smaller text"
        >
          <Minus size={14} />
        </button>
        <span className="min-w-9 text-center text-xs font-semibold text-white sm:min-w-12 sm:text-sm">{fontSize}px</span>
        <button
          onClick={() => onFontSizeChange(Math.min(MAX_SIZE, fontSize + 2))}
          className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:h-8 sm:w-8"
          title="Larger text"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
