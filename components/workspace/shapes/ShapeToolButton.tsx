// ---------------------------------------------------------------------------
// Shape Tool – Toolbar shape picker button with dropdown selection
// ---------------------------------------------------------------------------

"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
} from "lucide-react";

interface ShapeToolButtonProps {
  activeShapeKind: ShapeKind;
  isActive: boolean;
  onSelectShapeKind: (kind: ShapeKind) => void;
  onOpen?: () => void;
}

// Icon mapper for shape dropdown items
export const ShapeToolIcon = ({ kind, size = 16, className = "" }: { kind: ShapeKind; size?: number; className?: string }) => {
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
  onOpen,
}: ShapeToolButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Render the menu in a body-level portal so the mobile toolbar's
  // scroll container cannot clip it.
  useEffect(() => {
    if (!isOpen) return;

    const placeMenu = () => {
      const anchor = buttonRef.current?.getBoundingClientRect();
      if (!anchor) return;

      const menuWidth = 178;
      const menuHeight = Math.min(420, window.innerHeight - 16);
      const gap = 8;
      const openRight = anchor.right + gap + menuWidth <= window.innerWidth - 8;
      const left = openRight
        ? anchor.right + gap
        : Math.max(8, anchor.left - menuWidth - gap);
      const top = Math.min(
        Math.max(8, anchor.top),
        Math.max(8, window.innerHeight - menuHeight - 8),
      );

      setMenuPosition({ top, left });
    };

    placeMenu();
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [isOpen]);

  // Treat clicks inside the portalled menu as internal clicks.
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Opening the picker is separate from selecting a shape. Desktop may
    // preserve its existing activate-on-open behavior via onOpen; mobile
    // leaves the launcher mounted until the user selects a shape.
    if (!isOpen) onOpen?.();
    setIsOpen((open) => !open);
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
        ref={buttonRef}
        type="button"
        onClick={handleButtonClick}
        aria-label={`Choose shape: ${SHAPE_LABELS[activeShapeKind]}`}
        aria-expanded={isOpen}
        className={`rounded-md p-2.5 transition-colors ${
          isActive || isOpen ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-50 text-slate-400"
        }`}
        title={`Shapes — ${SHAPE_LABELS[activeShapeKind]}`}
      >
        <ShapeToolIcon kind={activeShapeKind} size={20} />
      </button>

      {isOpen && menuPosition && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: menuPosition.top, left: menuPosition.left, maxHeight: "min(70dvh, 420px)" }}
            className="z-[20000] min-w-[170px] overflow-y-auto rounded-lg border border-slate-100 bg-white p-1.5 shadow-xl flex flex-col gap-0.5 animate-in fade-in duration-100"
          >
            <div className="sticky top-0 bg-white text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
              Shapes
            </div>
            {shapeKinds.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => selectKind(kind)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-xs font-medium transition-colors ${
                  activeShapeKind === kind
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <ShapeToolIcon kind={kind} size={14} className={activeShapeKind === kind ? "text-indigo-600" : "text-slate-400"} />
                <span>{SHAPE_LABELS[kind]}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
