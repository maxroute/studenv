"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { Baseline, Check, Type } from "lucide-react";
import { placeFloating } from "@/lib/notes/floating";
import { noteFontVariables } from "./note-fonts";
import { NOTE_FONTS, NOTE_TEXT_COLORS, noteColorValue, noteFontValue } from "@/lib/notes/text-styles";

/**
 * A toolbar button with a small menu under it. Pressing keeps the editor's
 * selection. The menu is portalled to <body> at the button's screen position:
 * the phone toolbar scrolls sideways (which would clip it) and the bubble menu
 * is moved with a transform (which breaks fixed positioning inside it).
 */
function MenuButton({ label, icon, children }: { label: string; icon: ReactNode; children: (close: () => void) => ReactNode }) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const open = anchor !== null;

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !popoverRef.current?.contains(target)) setAnchor(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAnchor(null);
    };
    const dismiss = () => setAnchor(null);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  // Keep the menu on screen (and above the phone keyboard) once its size is known.
  useEffect(() => {
    const popover = popoverRef.current;
    const button = buttonRef.current;
    if (!popover || !button || !anchor) return;
    placeFloating(popover, button.getBoundingClientRect(), { maxHeight: 380 });
  }, [anchor]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={open ? "active" : undefined}
        onPointerDown={(event) => event.preventDefault()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect();
          setAnchor(open || !rect ? null : { top: rect.bottom + 6, left: Math.max(8, rect.left) });
        }}
      >
        {icon}
      </button>
      {anchor
        ? createPortal(
            <div
              ref={popoverRef}
              className={`note-style-popover ${noteFontVariables}`}
              role="menu"
              aria-label={label}
              style={{ top: anchor.top, left: anchor.left }}
              onPointerDown={(event) => event.preventDefault()}
              onMouseDown={(event) => event.preventDefault()}
            >
              {children(() => setAnchor(null))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function TextColorMenu({ editor }: { editor: Editor }) {
  const current = editor.getAttributes("textStyle").color as string | undefined;
  return (
    <MenuButton
      label="Text color"
      icon={<Baseline size={15} style={current ? { color: current } : undefined} />}
    >
      {(close) => (
        <>
          <div className="note-style-heading">Text color</div>
          <div className="note-color-grid">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!current}
              className="note-color-swatch default"
              title="Default"
              aria-label="Default color"
              onClick={() => {
                editor.chain().focus().unsetColor().run();
                close();
              }}
            >
              A
            </button>
            {NOTE_TEXT_COLORS.map((color) => {
              const value = noteColorValue(color.key);
              return (
                <button
                  key={color.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={current === value}
                  className="note-color-swatch"
                  title={color.label}
                  aria-label={color.label}
                  style={{ color: value }}
                  onClick={() => {
                    editor.chain().focus().setColor(value).run();
                    close();
                  }}
                >
                  A
                </button>
              );
            })}
          </div>
        </>
      )}
    </MenuButton>
  );
}

export function FontMenu({ editor }: { editor: Editor }) {
  const current = editor.getAttributes("textStyle").fontFamily as string | undefined;
  return (
    <MenuButton label="Font" icon={<Type size={15} />}>
      {(close) => (
        <>
          <div className="note-style-heading">Font</div>
          <div className="note-font-list">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!current}
              className="note-font-option"
              onClick={() => {
                editor.chain().focus().unsetFontFamily().run();
                close();
              }}
            >
              <span className="note-font-name">Default</span>
              {!current ? <Check size={14} /> : null}
            </button>
            {NOTE_FONTS.map((font) => {
              const value = noteFontValue(font.key);
              return (
                <button
                  key={font.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={current === value}
                  className="note-font-option"
                  onClick={() => {
                    editor.chain().focus().setFontFamily(value).run();
                    close();
                  }}
                >
                  <span className="note-font-name" style={{ fontFamily: value }}>{font.label}</span>
                  <span className="note-font-sample">{font.sample}</span>
                  {current === value ? <Check size={14} /> : null}
                </button>
              );
            })}
          </div>
        </>
      )}
    </MenuButton>
  );
}
