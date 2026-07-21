"use client";

import { FreeTextNode as FreeTextNodeItem } from "@/types/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useEffect, useRef, useState } from "react";
import { Patrick_Hand } from "next/font/google";

interface FreeTextNodeProps {
  item: FreeTextNodeItem;
  isSelected?: boolean;
  isEditing?: boolean;
  onSelect?: () => void;
  onStartEditing?: () => void;
  onFinishEditing?: (saved: boolean) => void;
}

const patrickHand = Patrick_Hand({
  subsets: ["latin"],
  weight: "400",
});

export function FreeTextNode({
  item,
  isSelected = false,
  isEditing = false,
  onSelect,
  onStartEditing,
  onFinishEditing,
}: FreeTextNodeProps) {
  const { items, updateItem, updateItems, removeItem } = useWorkspaceStore();
  const [editText, setEditText] = useState(item.props.text ?? "");
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditText(item.props.text ?? "");
  }, [item.props.text]);

  useEffect(() => {
    if (!isEditing || !textareaRef.current) return;
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(
      textareaRef.current.value.length,
      textareaRef.current.value.length,
    );
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (rootRef.current?.contains(target)) {
        return;
      }

      window.setTimeout(() => {
        textareaRef.current?.blur();
      }, 0);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [isEditing]);

  useEffect(() => {
    const textToMeasure = isEditing ? editText : item.props.text;
    if (!measureRef.current || (!textToMeasure && !isEditing)) return;

    const nextWidth = Math.max(72, Math.min(720, measureRef.current.scrollWidth + 8));
    const nextHeight = Math.max(40, Math.min(360, measureRef.current.scrollHeight + 8));

    if (nextWidth !== item.w || nextHeight !== item.h) {
      updateItem(item.id, { w: nextWidth, h: nextHeight });
    }
  }, [editText, isEditing, item.h, item.id, item.props.fontSize, item.props.text, item.w, updateItem]);

  const finishEditing = (shouldSave: boolean) => {
    const nextText = editText.trim();

    if (!shouldSave || !nextText) {
      if (!item.props.text.trim()) {
        removeItem(item.id);
      } else {
        setEditText(item.props.text);
      }
      onFinishEditing?.(false);
      return;
    }

    const updatedItems = items.map((currentItem) => {
      if (currentItem.id !== item.id || currentItem.type !== "free-text") {
        return currentItem;
      }

      return {
        ...currentItem,
        props: {
          ...currentItem.props,
          text: editText,
        },
      };
    });

    updateItems(updatedItems as any);
    onFinishEditing?.(true);
  };

  const sharedStyle = {
    color: item.props.color ?? "#1e1e1e",
    fontSize: `${item.props.fontSize ?? 28}px`,
    lineHeight: 1.05,
    letterSpacing: "-0.01em",
  } as const;

  return (
    <div
      ref={rootRef}
      data-free-text-root="true"
      data-free-text-id={item.id}
      className="relative h-full w-full"
    >
      <div
        ref={measureRef}
        className={`${patrickHand.className} pointer-events-none absolute left-0 top-0 -z-10 whitespace-pre-wrap break-words opacity-0`}
        style={{
          width: "max-content",
          maxWidth: "720px",
          padding: "4px",
          ...sharedStyle,
        }}
      >
        {isEditing ? editText || " " : item.props.text || " "}
      </div>

      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={editText}
          spellCheck={false}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={() => finishEditing(true)}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelect?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              e.preventDefault();
              finishEditing(false);
            }

            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.stopPropagation();
              e.preventDefault();
              finishEditing(true);
            }
          }}
          placeholder="Type..."
          className={`${patrickHand.className} h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none ring-0 shadow-none focus:outline-none focus:ring-0`}
          style={{
            ...sharedStyle,
            appearance: "none",
            WebkitAppearance: "none",
          }}
        />
      ) : (
        <div
          className={`${
            patrickHand.className
          } drag-handle h-full w-full whitespace-pre-wrap break-words bg-transparent px-1 py-0.5 ${
            isSelected ? "cursor-move" : "cursor-grab"
          }`}
          style={{
            ...sharedStyle,
            userSelect: "none",
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelect?.();
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartEditing?.();
          }}
        >
          {item.props.text}
        </div>
      )}
    </div>
  );
}
