"use client";

import { useEffect, useRef, useState } from "react";
import { StickyNode as StickyNodeItem } from "@/types/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";

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
}

export function StickyNode({ item, isSelected, isEditing, onFinishEditing }: StickyNodeProps) {
  const updateItemProps = useWorkspaceStore((state) => state.updateItemProps);
  const [draft, setDraft] = useState(item.props.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(item.props.text);
  }, [item.id, item.props.text]);

  useEffect(() => {
    if (!isEditing) return;
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(draft.length, draft.length);
  }, [isEditing, item.id]);

  const save = () => {
    if (draft !== item.props.text) {
      updateItemProps(item.id, { text: draft });
    }
  };

  const color = item.props.color || STICKY_NOTE_COLORS[0].value;

  return (
    <div
      className="sticky-note-paper relative h-full w-full"
      style={{
        backgroundColor: color,
        transform: "rotate(5deg)",
        transformOrigin: "center center",
        boxShadow: isSelected
          ? "0 13px 24px rgba(40, 34, 20, 0.18), 0 3px 7px rgba(40, 34, 20, 0.10), 0 0 0 2px rgba(99, 102, 241, 0.65)"
          : "0 10px 20px rgba(40, 34, 20, 0.14), 0 2px 5px rgba(40, 34, 20, 0.08)",
        clipPath: "polygon(0 0, 100% 0, 100% 94%, 96% 100%, 0 100%)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 h-7 w-7"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.28) 48%, rgba(110,88,45,0.13) 100%)",
          clipPath: "polygon(0 100%, 100% 0, 100% 100%)",
          filter: "drop-shadow(-1px -1px 1px rgba(70, 55, 25, 0.12))",
        }}
      />
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            updateItemProps(item.id, { text: event.target.value });
          }}
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
          className="relative z-10 h-full w-full resize-none border-0 bg-transparent p-5 text-[15px] leading-6 text-slate-800 outline-none placeholder:text-slate-500/60"
          style={{ fontFamily: "inherit" }}
        />
      ) : (
        <div
          className="relative z-10 h-full w-full whitespace-pre-wrap break-words p-5 text-[15px] leading-6 text-slate-800"
          style={{ fontFamily: "inherit" }}
        >
          {item.props.text || (isSelected ? <span className="text-slate-500/50"> </span> : null)}
        </div>
      )}
    </div>
  );
}
