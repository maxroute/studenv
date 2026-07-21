"use client";

import { VideoAnchorNode } from "@/types/workspace";
import { useViewerStore } from "@/hooks/use-viewer-store";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { Play, Clock, StickyNote, Pencil, Check, X, GripHorizontal } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface VideoAnchorProps {
  item: VideoAnchorNode;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
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
      if (i.id === item.id && i.type === "video-anchor") {
        return {
          ...i,
          props: {
            ...i.props,
            notes: editNotes.trim() || undefined,
          },
        };
      }
      return i;
    });
    updateItems(updatedItems as any);
    setIsEditing(false);
  };

  const handleCancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditNotes(item.props.notes ?? "");
    setIsEditing(false);
  };

  const hasNotes = Boolean(item.props.notes);

  return (
    <div className="w-full h-full flex flex-col bg-white overflow-hidden">
      {/* Drag Handle Header — this is the movable area */}
      <div className="drag-handle bg-gradient-to-r from-slate-800 to-slate-700 px-2 py-1.5 flex items-center justify-between gap-1 shrink-0 cursor-move select-none">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <GripHorizontal className="w-3 h-3 text-slate-400 shrink-0" />
          <span className="text-[11px] font-medium text-white truncate leading-tight">
            {item.props.label || "Video Anchor"}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Play button */}
          <button
            onClick={handlePlay}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
            title={`Jump to ${formatTimestamp(item.props.startTimeMs)}`}
          >
            <Play className="w-2.5 h-2.5 fill-white text-white" />
            <span className="text-[10px] font-mono text-indigo-300 font-semibold">
              {formatTimestamp(item.props.startTimeMs)}
            </span>
          </button>
          {/* Edit / Save / Cancel in header */}
          {isEditing ? (
            <>
              <button
                onClick={handleCancelEdit}
                className="p-0.5 hover:bg-white/20 rounded text-slate-300 transition-colors"
                title="Cancel (Esc)"
              >
                <X className="w-3 h-3" />
              </button>
              <button
                onClick={handleSaveNotes}
                className="p-0.5 hover:bg-green-500/30 rounded text-green-400 transition-colors"
                title="Save (Ctrl+Enter)"
              >
                <Check className="w-3 h-3" />
              </button>
            </>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditNotes(item.props.notes ?? "");
                setIsEditing(true);
              }}
              className="p-0.5 hover:bg-white/20 rounded text-slate-400 transition-colors"
              title="Edit note"
            >
              <Pencil className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>
      
      {/* Notes Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {isEditing ? (
          <div className="flex-1 flex flex-col p-1.5" onClick={(e) => e.stopPropagation()}>
            <textarea
              ref={textareaRef}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Add your notes..."
              className="flex-1 text-[11px] leading-relaxed text-slate-700 bg-amber-50/50 border border-amber-200/60 rounded px-2 py-1.5 resize-none focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/20 min-h-0"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSaveNotes();
                }
                if (e.key === "Escape") {
                  handleCancelEdit();
                }
              }}
            />
          </div>
        ) : hasNotes ? (
          <div className="flex-1 flex flex-col p-2 min-h-0 overflow-hidden">
            <div className="flex items-center gap-1 mb-1 shrink-0">
              <StickyNote className="w-2.5 h-2.5 text-amber-500" />
              <span className="text-[9px] font-semibold text-amber-600 uppercase tracking-wider">Note</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-600 overflow-y-auto flex-1 whitespace-pre-wrap min-h-0">
              {item.props.notes}
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-2 text-center">
            <span className="text-[10px] text-slate-400">
              {opening ? "Opening..." : "Click ▶ to jump"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
