// ---------------------------------------------------------------------------
// Shape Tool – Toolbar shape picker button with dropdown selection
// ---------------------------------------------------------------------------

"use client";

import React, { useState, useRef, useEffect } from "react";
import type { ShapeKind } from "@/lib/workspace/shape-types";
import { SHAPE_LABELS } from "@/lib/workspace/shape-types";
import {
  Square,
  Circle,
  Triangle,
  Hexagon,
  Star,
  ArrowRight,
  Minus,
  ChevronRight,
} from "lucide-react";

interface ShapeToolButtonProps {
  activeShapeKind: ShapeKind;
  isActive: boolean;
  onSelectShapeKind: (kind: ShapeKind) => void;
  onClick: () => void;
}

// Icon mapper for shape dropdown items
const ShapeIcon = ({ kind, size = 16, className = "" }: { kind: ShapeKind; size?: number; className?: string }) => {
  switch (kind) {
    case "rectangle":
      return <Square size={size} className={className} />;
    case "rounded-rectangle":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <rect x="2" y="4" width="20" height="16" rx="4" ry="4" />
        </svg>
      );
    case "circle":
      return <Circle size={size} className={className} />;
    case "ellipse":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <ellipse cx="12" cy="12" rx="10" ry="6" />
        </svg>
      );
    case "triangle":
      return <Triangle size={size} className={className} />;
    case "diamond":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M12 2L2 12l10 10 10-10z" />
        </svg>
      );
    case "hexagon":
      return <Hexagon size={size} className={className} />;
    case "pentagon":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M12 2l9 7-3.5 11h-11L3 9z" />
        </svg>
      );
    case "star":
      return <Star size={size} className={className} />;
    case "arrow":
      return <ArrowRight size={size} className={className} />;
    case "line":
      return <Minus size={size} className={className} />;
    default:
      return <Square size={size} className={className} />;
  }
};

export function ShapeToolButton({
  activeShapeKind,
  isActive,
  onSelectShapeKind,
  onClick,
}: ShapeToolButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleMainButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
  };

  const handleArrowClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const selectKind = (kind: ShapeKind) => {
    onSelectShapeKind(kind);
    setIsOpen(false);
  };

  const shapeKinds: ShapeKind[] = [
    "rectangle",
    "rounded-rectangle",
    "circle",
    "ellipse",
    "triangle",
    "diamond",
    "hexagon",
    "pentagon",
    "star",
    "arrow",
    "line",
  ];

  return (
    <div ref={containerRef} className="relative flex items-center select-none">
      <button
        onClick={handleMainButtonClick}
        className={`p-2 rounded-l-md transition-colors border-r border-slate-100 ${
          isActive ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-50 text-slate-400"
        }`}
        title={`Shape Tool (${SHAPE_LABELS[activeShapeKind]})`}
      >
        <ShapeIcon kind={activeShapeKind} size={18} />
      </button>
      <button
        onClick={handleArrowClick}
        className={`p-1 py-2.5 rounded-r-md transition-colors flex items-center justify-center ${
          isActive ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-50 text-slate-400"
        }`}
        title="Select Shape Kind"
      >
        <ChevronRight size={10} className={`transform transition-transform ${isOpen ? "rotate-90" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute left-14 top-0 bg-white border border-slate-100 shadow-xl rounded-lg p-1.5 z-[1300] min-w-[170px] flex flex-col gap-0.5 animate-in fade-in duration-100 slide-in-from-left-2">
          <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
            Shapes
          </div>
          {shapeKinds.map((kind) => (
            <button
              key={kind}
              onClick={() => selectKind(kind)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-xs font-medium transition-colors ${
                activeShapeKind === kind
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <ShapeIcon kind={kind} size={14} className={activeShapeKind === kind ? "text-indigo-600" : "text-slate-400"} />
              <span>{SHAPE_LABELS[kind]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
