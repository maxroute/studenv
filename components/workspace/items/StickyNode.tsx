
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { StickyNode as StickyNodeItem } from "@/types/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { Patrick_Hand } from "next/font/google";

const patrickHand = Patrick_Hand({
  subsets: ["latin"],
  weight: "400",
});

export const STICKY_NOTE_COLORS = [
  { label: "Warm yellow", value: "#F8E7A1" },
  { label: "Mint green", value: "#CDEBDD" },
  { label: "Soft pink", value: "#F6D7DE" },
  { label: "Sky blue", value: "#D6E8F8" },
  { label: "Lavender", value: "#E6DDF7" },
  { label: "Peach", value: "#F8DDC8" },
] as const;

interface StickyNodeProps {
  item: StickyNodeItem;
  isSelected: boolean;
  isEditing: boolean;
  onFinishEditing: () => void;
  onColorChange: (color: string) => void;
}

export function StickyNode({
  item,
  isSelected,
  isEditing,
  onFinishEditing,
  onColorChange,
}: StickyNodeProps) {
  const updateItemProps = useWorkspaceStore(
    (state) => state.updateItemProps
  );

  const [draft, setDraft] = useState(item.props.text);
  const [fitFontSize, setFitFontSize] = useState(28);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const displayRef = useRef<HTMLDivElement | null>(null);

  // Keep the local draft synchronized with stored text.
  useEffect(() => {
    setDraft(item.props.text);
  }, [item.id, item.props.text]);

  // Focus the textarea when editing begins.
  useEffect(() => {
    if (!isEditing) return;

    const frame = requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.focus();
      textarea.setSelectionRange(
        textarea.value.length,
        textarea.value.length
      );
    });

    return () => cancelAnimationFrame(frame);
  }, [isEditing, item.id]);

  // Automatically fit text inside the sticky note.
  useLayoutEffect(() => {
    const element = isEditing
      ? textareaRef.current
      : displayRef.current;

    if (!element) return;

    const maxFontSize = 28;
    const minFontSize = 12;
    const step = 0.5;

    let size = maxFontSize;

    element.style.fontSize = `${size}px`;

    while (
      size > minFontSize &&
      (
        element.scrollHeight > element.clientHeight + 1 ||
        element.scrollWidth > element.clientWidth + 1
      )
    ) {
      size = Math.max(minFontSize, size - step);
      element.style.fontSize = `${size}px`;
    }

    setFitFontSize(size);
  }, [
    draft,
    item.props.text,
    item.w,
    item.h,
    isEditing,
  ]);

  const save = () => {
    if (draft !== item.props.text) {
      updateItemProps(item.id, { text: draft });
    }
  };

  const handleTextChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const value = event.target.value;

    setDraft(value);
    updateItemProps(item.id, { text: value });
  };

  const color = item.props.color || STICKY_NOTE_COLORS[0].value;

  const textStyle = {
    fontSize: `${fitFontSize}px`,
    lineHeight: 1.05,
    letterSpacing: "-0.01em",
    overflowWrap: "anywhere" as const,
  };

  return (
    <div className="relative h-full w-full">

      {/* Color toolbar */}
      {isSelected && (
        <div
          className="absolute left-1/2 top-0 z-40 flex -translate-x-1/2 -translate-y-[calc(100%+12px)] items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm"
          aria-label="Sticky note color"
          onPointerDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
          }}
        >
          {STICKY_NOTE_COLORS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onColorChange(option.value);
              }}
              className={`h-5 w-5 shrink-0 rounded-full border border-black/10 transition-transform hover:scale-110 ${color === option.value
                ? "ring-2 ring-indigo-500 ring-offset-2"
                : ""
                }`}
              style={{ backgroundColor: option.value }}
              title={option.label}
              aria-label={option.label}
              aria-pressed={color === option.value}
            />
          ))}
        </div>
      )}

      {/* Sticky paper */}
      <div
        className="sticky-note-paper relative h-full w-full"
        style={{
          backgroundColor: color,
          transform: "rotate(4deg)",
          transformOrigin: "center center",

          // Subtle natural lift.
          boxShadow: isSelected
            ? `
              0 10px 17px rgba(40, 34, 20, 0.13),
              3px 6px 9px rgba(40, 34, 20, 0.08),
              0 0 0 2px rgba(99, 102, 241, 0.65)
            `
            : `
              0 9px 15px rgba(40, 34, 20, 0.12),
              3px 5px 8px rgba(40, 34, 20, 0.07)
            `,
        }}
      >

        {/* Dedicated drag grip remains available while the note text is being edited. */}
        {isEditing && (
          <div
            aria-label="Move sticky note"
            title="Drag to move note"
            className="drag-handle absolute right-3 top-2 z-30 flex h-7 w-10 cursor-grab touch-none items-center justify-center rounded-md bg-black/5 text-slate-600/70 active:cursor-grabbing"
            style={{ touchAction: "none" }}
          >
            <span aria-hidden="true" className="flex gap-1">
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
            </span>
          </div>
        )}

        {/* Editable text */}
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleTextChange}
            onBlur={() => {
              save();
              onFinishEditing();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.blur();
              }

              event.stopPropagation();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            placeholder="Write something..."
            aria-label="Sticky note text"
            spellCheck={false}
            className={`${patrickHand.className} relative z-10 h-full w-full resize-none overflow-hidden border-0 bg-transparent p-5 text-slate-800 outline-none placeholder:text-slate-500/60`}
            style={textStyle}
          />
        ) : (
          /* Display text */
          <div
            ref={displayRef}
            className={`${patrickHand.className} drag-handle relative z-10 h-full w-full overflow-hidden whitespace-pre-wrap break-words p-5 text-slate-800 cursor-move`}
            style={textStyle}
          >
            {item.props.text || (
              isSelected ? (
                <span className="text-slate-500/50"> </span>
              ) : null
            )}
          </div>
        )}

        {/* Subtle naturally lifted bottom-right corner */}
        {/* Subtle bottom-right corner lift */}
        {/* Natural corner tension shadow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 right-0 z-20 h-10 w-14"
          style={{
            background:
              "radial-gradient(ellipse at 100% 100%, rgba(116, 94, 53, 0.16) 0%, rgba(116, 94, 53, 0.07) 35%, transparent 72%)",
            maskImage:
              "radial-gradient(ellipse at 100% 100%, black 0%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at 100% 100%, black 0%, transparent 75%)",
          }}
        />
      </div>
    </div>
  );
}
