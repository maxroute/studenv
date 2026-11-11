"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Circle, Copy, Diamond, Square, StickyNote, Triangle, Type } from "lucide-react";
import type { ShapeKind } from "@/lib/workspace/shape-types";

export type DropPanelChoice =
  | { kind: "shape"; shape: ShapeKind }
  | { kind: "free-text" }
  | { kind: "sticky" }
  | { kind: "same" };

const SHAPE_CHOICES: Array<{ shape: ShapeKind; label: string; Icon: typeof Square }> = [
  { shape: "rectangle", label: "Rectangle", Icon: Square },
  { shape: "ellipse", label: "Ellipse", Icon: Circle },
  { shape: "diamond", label: "Diamond", Icon: Diamond },
  { shape: "triangle", label: "Triangle", Icon: Triangle },
];

/**
 * AFFiNE auto-complete panel: opened when a connector dragged from an
 * auto-complete arrow is released on empty canvas. Choosing an option
 * creates that object at the connector's free end and attaches it; clicking
 * away keeps the free-ended connector.
 */
export function ConnectorDropPanel({
  clientX,
  clientY,
  onHover,
  onChoose,
  onClose,
}: {
  clientX: number;
  clientY: number;
  onHover: (choice: DropPanelChoice | null) => void;
  onChoose: (choice: DropPanelChoice) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", escape);
    };
  }, [onClose]);

  // Keep the panel inside the viewport with a 20 px margin (AFFiNE clamps the same way).
  const width = 168;
  const height = 196;
  const left = Math.min(Math.max(clientX + 12, 20), (typeof window !== "undefined" ? window.innerWidth : 1024) - 20 - width);
  const top = Math.min(Math.max(clientY + 12, 20), (typeof window !== "undefined" ? window.innerHeight : 768) - 20 - height);

  const row = "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-slate-700 hover:bg-slate-100";

  // Portalled to <body>: inside the canvas's transformed world layer a fixed
  // element would be positioned relative to that layer, not the viewport.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Add a connected object"
      data-connector-drop-panel="true"
      onPointerDown={(event) => event.stopPropagation()}
      className="fixed z-[12000] flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
      style={{ left, top, width }}
      onPointerLeave={() => onHover(null)}
    >
      <div className="grid grid-cols-4 gap-1 border-b border-slate-100 pb-1">
        {SHAPE_CHOICES.map(({ shape, label, Icon }) => (
          <button
            key={shape}
            type="button"
            role="menuitem"
            title={label}
            aria-label={label}
            onPointerEnter={() => onHover({ kind: "shape", shape })}
            onClick={() => onChoose({ kind: "shape", shape })}
            className="flex h-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
      <button type="button" role="menuitem" className={row} onPointerEnter={() => onHover({ kind: "free-text" })} onClick={() => onChoose({ kind: "free-text" })}>
        <Type size={15} /> Text
      </button>
      <button type="button" role="menuitem" className={row} onPointerEnter={() => onHover({ kind: "sticky" })} onClick={() => onChoose({ kind: "sticky" })}>
        <StickyNote size={15} /> Sticky note
      </button>
      <button type="button" role="menuitem" className={row} onPointerEnter={() => onHover({ kind: "same" })} onClick={() => onChoose({ kind: "same" })}>
        <Copy size={15} /> Add a same object
      </button>
    </div>,
    document.body,
  );
}
