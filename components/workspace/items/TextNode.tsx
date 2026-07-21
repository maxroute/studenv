"use client";

import { TextNode as TextNodeItem } from "@/types/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { Pencil, Check, X, GripHorizontal, Type } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface TextNodeProps {
  item: TextNodeItem;
}

export function TextNode({ item }: TextNodeProps) {
  const { items, updateItems } = useWorkspaceStore();
  const [isEditing, setIsEditing] = useState(!item.props.text);
  const [editText, setEditText] = useState(item.props.text ?? "");
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

  const handleSave = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updatedItems = items.map((i) => {
      if (i.id === item.id && i.type === "text") {
        return {
          ...i,
          props: {
            ...i.props,
            text: editText,
          },
        };
      }
      return i;
    });
    updateItems(updatedItems as any);
    setIsEditing(false);
  };

  const handleCancel = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditText(item.props.text ?? "");
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
    if (e.key === "Escape") {
      handleCancel();
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white overflow-hidden shadow-sm border border-slate-200 rounded-md group/node">
      {/* Header / Drag Handle */}
      <div className="drag-handle bg-slate-50 px-2 py-1.5 flex items-center justify-between gap-1 shrink-0 cursor-move select-none border-b border-slate-100">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <GripHorizontal className="w-3 h-3 text-slate-400 shrink-0" />
          <Type className="w-3 h-3 text-slate-500 shrink-0" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-tight">
            Note
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/node:opacity-100 transition-opacity">
          {isEditing ? (
            <>
              <button
                onClick={handleCancel}
                className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors"
                title="Cancel (Esc)"
              >
                <X className="w-3 h-3" />
              </button>
              <button
                onClick={handleSave}
                className="p-1 hover:bg-indigo-100 rounded text-indigo-600 transition-colors"
                title="Save (Ctrl+Enter)"
              >
                <Check className="w-3 h-3" />
              </button>
            </>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors"
              title="Edit"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div 
        className="flex-1 overflow-auto p-3 bg-white"
        onDoubleClick={(e) => {
            e.stopPropagation();
            if (!isEditing) setIsEditing(true);
        }}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-full resize-none text-sm text-slate-700 focus:outline-none placeholder:text-slate-300"
            placeholder="Type your note here... (Markdown supported)"
          />
        ) : (
          <div className="prose prose-sm prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-50 prose-pre:border prose-pre:border-slate-100">
            {editText ? (
              <ReactMarkdown>{editText}</ReactMarkdown>
            ) : (
              <span className="text-slate-300 italic text-sm">Double-click to add text...</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
