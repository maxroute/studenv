"use client";

import { VideoAnchorNode } from "@/types/workspace";
import { useViewerStore } from "@/hooks/use-viewer-store";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { Play, Check, X, GripHorizontal } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface VideoAnchorProps {
  item: VideoAnchorNode;
}

const NOTE_COLORS = [
  "#F8E7A1",
  "#CDEBDD",
  "#F6D7DE",
  "#D6E8F8",
  "#E6DDF7",
  "#F8DDC8",
];

function getContrastingTextColor(hexColor: string) {
  const hex = hexColor.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#1F2937";
  const channels = [0, 2, 4].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.42 ? "#1F2937" : "#FFFFFF";
}

function formatTimestamp(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function VideoAnchor({ item }: VideoAnchorProps) {
  const { seekTo, openViewer, viewers } = useViewerStore();
  const [opening, setOpening] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editNotes, setEditNotes] = useState(item.props.notes ?? "");
  const [noteColor, setNoteColor] = useState(item.props.color || NOTE_COLORS[0]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textColor = getContrastingTextColor(noteColor);

  useEffect(() => {
    setEditNotes(item.props.notes ?? "");
    setNoteColor(item.props.color || NOTE_COLORS[0]);
  }, [item.id, item.props.notes, item.props.color]);

  useEffect(() => {
    if (!isEditing || !textareaRef.current) return;
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(
      textareaRef.current.value.length,
      textareaRef.current.value.length,
    );
  }, [isEditing]);

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditing) return;
    const { assetId, startTimeMs } = item.props;
    if (!assetId) return;

    const existingViewer = viewers.find(
      (viewer) => viewer.id === assetId || viewer.assetId === assetId,
    );
    if (existingViewer) {
      seekTo(assetId, startTimeMs);
      return;
    }

    try {
      setOpening(true);
      const response = await fetch(`/api/assets/${assetId}`);
      if (!response.ok) throw new Error("Failed to load linked video");
      const asset = await response.json();
      if (asset.kind !== "video") throw new Error("Linked asset is not a video");
      openViewer({
        id: asset.id,
        title: asset.title,
        type: "video",
        contentUrl: asset.contentUrl,
        assetId: asset.id,
        revisionId: asset.currentRevisionId ?? undefined,
        currentTime: startTimeMs,
      });
      seekTo(asset.id, startTimeMs);
    } catch (error) {
      console.warn("Failed to reopen video viewer from anchor", error);
    } finally {
      setOpening(false);
    }
  };

  const handleSaveNotes = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const { items, updateItems } = useWorkspaceStore.getState();
    const updatedItems = items.map((i) => {
      if (i.id !== item.id || i.type !== "video-anchor") return i;
      return {
        ...i,
        props: {
          ...i.props,
          notes: editNotes.trim() || undefined,
          color: noteColor,
        },
      };
    });
    updateItems(updatedItems as any);
    setIsEditing(false);
  };

  const handleCancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditNotes(item.props.notes ?? "");
    setNoteColor(item.props.color || NOTE_COLORS[0]);
    setIsEditing(false);
  };

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden rounded-sm shadow-md"
      style={{ backgroundColor: noteColor, color: textColor }}
    >
      <div className="drag-handle flex shrink-0 items-center justify-between gap-2 border-b border-black/10 px-2.5 py-2 cursor-move select-none">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <GripHorizontal className="h-3.5 w-3.5 shrink-0 opacity-50" />
          <span className="truncate text-[11px] font-semibold">
            {item.props.label || "Video note"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={handlePlay}
            className="flex items-center gap-1 rounded-md bg-black/10 px-2 py-1 transition-colors hover:bg-black/15"
            title={`Jump to ${formatTimestamp(item.props.startTimeMs)}`}
            aria-label={`Jump to ${formatTimestamp(item.props.startTimeMs)}`}
          >
            <Play className="h-3 w-3 fill-current" />
            <span className="text-[11px] font-mono font-semibold">
              {formatTimestamp(item.props.startTimeMs)}
            </span>
          </button>
          {isEditing ? (
            <>
              <button onClick={handleCancelEdit} className="rounded p-1 hover:bg-black/10" title="Cancel edit">
                <X className="h-3.5 w-3.5" />
              </button>
              <button onClick={handleSaveNotes} className="rounded p-1 hover:bg-black/10" title="Save note">
                <Check className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditNotes(item.props.notes ?? "");
                setNoteColor(item.props.color || NOTE_COLORS[0]);
                setIsEditing(true);
              }}
              className="rounded px-1.5 py-1 text-[10px] font-semibold hover:bg-black/10"
              title="Edit note"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {isEditing && (
        <div
          className="flex shrink-0 items-center gap-2 border-b border-black/10 px-2.5 py-2"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {NOTE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setNoteColor(color);
              }}
              className={`h-5 w-5 rounded-full border border-black/15 transition-transform hover:scale-110 ${noteColor === color ? "ring-2 ring-indigo-500 ring-offset-2" : ""}`}
              style={{ backgroundColor: color }}
              aria-label={`Set note color ${color}`}
              aria-pressed={noteColor === color}
            />
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 p-2.5">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editNotes}
            onChange={(event) => setEditNotes(event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                handleSaveNotes();
              }
              if (event.key === "Escape") handleCancelEdit();
              event.stopPropagation();
            }}
            placeholder="Write something..."
            aria-label="Video timestamp note"
            className="h-full w-full resize-none border-0 bg-transparent text-sm leading-relaxed outline-none placeholder:opacity-50"
            style={{ color: textColor }}
          />
        ) : (
          <div
            className="h-full w-full overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed"
            style={{ color: textColor }}
          >
            {item.props.notes || (opening ? "Opening..." : "Write a note for this moment")}
          </div>
        )}
      </div>
    </div>
  );
}
