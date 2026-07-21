"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  Calendar,
  Clock,
  RotateCcw,
  AlertTriangle,
  Tag,
  Plus,
  Check,
} from "lucide-react";
import { toast } from "react-hot-toast";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  category: string;
  dueDate: string | null;
  dueTime: string | null;
  estimatedDuration: number | null;
  notificationEnabled: boolean;
  repeat: string;
  color: string | null;
  icon: string | null;
  notes: string | null;
}

interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  task?: Task | null;
}

const CATEGORIES = [
  "Study",
  "Assignment",
  "Exam",
  "Project",
  "Revision",
  "Reading",
  "Personal",
  "Custom",
];

const PRIORITIES = [
  {
    value: "low",
    label: "Low",
    color: "#9c9788",
    bg: "rgba(156,151,136,0.12)",
  },
  {
    value: "medium",
    label: "Medium",
    color: "#1a9e75",
    bg: "rgba(26,158,117,0.12)",
  },
  {
    value: "high",
    label: "High",
    color: "#c97d0c",
    bg: "rgba(201,125,12,0.12)",
  },
  {
    value: "urgent",
    label: "Urgent",
    color: "#e05555",
    bg: "rgba(224,85,85,0.12)",
  },
];

const REPEAT_OPTIONS = [
  { value: "none", label: "No Repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
];

const PRESET_COLORS = [
  "#9c9788", // Gray
  "#1a9e75", // Green
  "#c97d0c", // Orange
  "#e05555", // Red
  "#8878d4", // Purple
  "#3b82f6", // Blue
  "#ec4899", // Pink
  "#eab308", // Yellow
];

export function TaskDialog({ open, onClose, onSave, task }: TaskDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [category, setCategory] = useState("Study");
  const [customCategory, setCustomCategory] = useState("");
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [estimatedDuration, setEstimatedDuration] = useState("");
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [repeat, setRepeat] = useState("none");
  const [color, setColor] = useState("#1a9e75");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize fields if editing
  useEffect(() => {
    if (open) {
      if (task) {
        setTitle(task.title);
        setDescription(task.description || "");
        setPriority(task.priority);

        if (CATEGORIES.includes(task.category)) {
          setCategory(task.category);
          setShowCustomCategory(false);
        } else {
          setCategory("Custom");
          setCustomCategory(task.category);
          setShowCustomCategory(true);
        }

        // Convert ISO date to YYYY-MM-DD
        if (task.dueDate) {
          const d = new Date(task.dueDate);
          const yyyy = d.getUTCFullYear();
          const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
          const dd = String(d.getUTCDate()).padStart(2, "0");
          setDueDate(`${yyyy}-${mm}-${dd}`);
        } else {
          setDueDate("");
        }

        setDueTime(task.dueTime || "");
        setEstimatedDuration(
          task.estimatedDuration ? String(task.estimatedDuration) : "",
        );
        setNotificationEnabled(task.notificationEnabled);
        setRepeat(task.repeat);
        setColor(task.color || "#1a9e75");
        setNotes(task.notes || "");
      } else {
        // Reset fields for fresh task
        setTitle("");
        setDescription("");
        setPriority("medium");
        setCategory("Study");
        setCustomCategory("");
        setShowCustomCategory(false);
        setDueDate("");
        setDueTime("");
        setEstimatedDuration("");
        setNotificationEnabled(true);
        setRepeat("none");
        setColor("#1a9e75");
        setNotes("");
      }
    }
  }, [open, task]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        onClose();
      }
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        void handleSubmit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    open,
    title,
    description,
    priority,
    category,
    customCategory,
    dueDate,
    dueTime,
    estimatedDuration,
    notificationEnabled,
    repeat,
    color,
    notes,
  ]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim()) {
      toast.error("Task title is required.");
      return;
    }

    setIsSubmitting(true);
    const finalCategory =
      category === "Custom" ? customCategory.trim() || "Custom" : category;

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      category: finalCategory,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      dueTime: dueTime || null,
      estimatedDuration: estimatedDuration
        ? parseInt(estimatedDuration, 10)
        : null,
      notificationEnabled,
      repeat,
      color,
      notes: notes.trim() || null,
    };

    try {
      const url = task ? `/api/planner/tasks/${task.id}` : "/api/planner/tasks";
      const method = task ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        if (notificationEnabled && dueDate && dueTime && "Notification" in window && Notification.permission === "default") {
          await Notification.requestPermission();
        }
        toast.success(
          task ? "Task updated successfully." : "Task created successfully.",
        );
        onSave();
        onClose();
      } else {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to save task.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm md:p-6">
      {/* Mobile Backdrop Tap Area */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Main Dialog / Bottom Sheet for Mobile */}
      <div
        className="relative flex max-h-[92vh] w-full max-w-[550px] flex-col rounded-[18px] border border-white/[0.065] bg-[#141410] text-[#e4dfcf] shadow-2xl animate-in fade-in zoom-in-95 duration-200 
                   max-md:absolute max-md:bottom-0 max-md:max-h-[85vh] max-md:rounded-b-none max-md:translate-y-0"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <h3 className="font-[family:var(--font-fraunces)] text-[18px] font-normal">
            {task ? "Edit Task" : "Create New Task"}
          </h3>
          <button
            onClick={onClose}
            className="rounded-full bg-white/[0.03] p-1.5 text-[#9c9788] transition hover:bg-white/[0.06] hover:text-[#e4dfcf]"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Form Body (Scrollable) */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-5 space-y-4"
        >
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-[#9c9788] font-medium">
              Task Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Physics Assignment 3"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-[#e4dfcf] placeholder-[#5c5a52] transition focus:border-[#c97d0c] focus:outline-none"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-[#9c9788] font-medium">
              Description
            </label>
            <textarea
              placeholder="Short summary of what needs to be done..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-[#e4dfcf] placeholder-[#5c5a52] transition focus:border-[#c97d0c] focus:outline-none resize-none"
            />
          </div>

          {/* Priority & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-[#9c9788] font-medium">
                Priority
              </label>
              <div className="relative">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full appearance-none rounded-[8px] border border-white/[0.08] bg-[#1a1a14] px-3.5 py-2.5 text-[13px] text-[#e4dfcf] focus:border-[#c97d0c] focus:outline-none"
                >
                  {PRIORITIES.map((p) => (
                    <option
                      key={p.value}
                      value={p.value}
                      style={{ color: p.color }}
                    >
                      {p.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9c9788] text-[10px]">
                  ▼
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-[#9c9788] font-medium">
                Category
              </label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setShowCustomCategory(e.target.value === "Custom");
                  }}
                  className="w-full appearance-none rounded-[8px] border border-white/[0.08] bg-[#1a1a14] px-3.5 py-2.5 text-[13px] text-[#e4dfcf] focus:border-[#c97d0c] focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9c9788] text-[10px]">
                  ▼
                </div>
              </div>
            </div>
          </div>

          {/* Custom Category Input if selected */}
          {showCustomCategory && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
              <label className="text-[11px] uppercase tracking-wider text-[#9c9788] font-medium">
                Custom Category Name
              </label>
              <input
                type="text"
                placeholder="e.g. Coding"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                className="w-full rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-[13px] text-[#e4dfcf] placeholder-[#5c5a52] transition focus:border-[#c97d0c] focus:outline-none"
              />
            </div>
          )}

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-[#9c9788] font-medium flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-[#9c9788]" /> Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-[8px] border border-white/[0.08] bg-[#1a1a14] px-3.5 py-2 text-[13px] text-[#e4dfcf] focus:border-[#c97d0c] focus:outline-none [color-scheme:dark]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-[#9c9788] font-medium flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#9c9788]" /> Due Time
              </label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full rounded-[8px] border border-white/[0.08] bg-[#1a1a14] px-3.5 py-2 text-[13px] text-[#e4dfcf] focus:border-[#c97d0c] focus:outline-none [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Workload & Repeat Options */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-[#9c9788] font-medium">
                Est. Workload (Min)
              </label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 60"
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
                className="w-full rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-[13px] text-[#e4dfcf] placeholder-[#5c5a52] focus:border-[#c97d0c] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-[#9c9788] font-medium flex items-center gap-1.5">
                <RotateCcw className="h-3.5 w-3.5 text-[#9c9788]" /> Repeat
              </label>
              <div className="relative">
                <select
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  className="w-full appearance-none rounded-[8px] border border-white/[0.08] bg-[#1a1a14] px-3.5 py-2.5 text-[13px] text-[#e4dfcf] focus:border-[#c97d0c] focus:outline-none"
                >
                  {REPEAT_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9c9788] text-[10px]">
                  ▼
                </div>
              </div>
            </div>
          </div>

          {/* Quick Color Selector */}
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-[#9c9788] font-medium">
              Accent Color
            </label>
            <div className="flex flex-wrap gap-2.5 pt-1">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="relative h-6 w-6 rounded-full border border-white/10 transition hover:scale-110 active:scale-95"
                  style={{ backgroundColor: c }}
                >
                  {color === c && (
                    <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-[#9c9788] font-medium">
              Notes / Checklist Items
            </label>
            <textarea
              placeholder="Detailed sub-items, checklist, links, or instructions..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-[#e4dfcf] placeholder-[#5c5a52] transition focus:border-[#c97d0c] focus:outline-none resize-y"
            />
          </div>

          {/* Notifications Active State Checkbox */}
          {dueDate && dueTime && (
            <div className="flex items-center gap-2.5 rounded-[10px] bg-[#c97d0c]/5 border border-[#c97d0c]/20 p-3 animate-in fade-in duration-200">
              <input
                type="checkbox"
                id="reminder-enabled"
                checked={notificationEnabled}
                onChange={(e) => setNotificationEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-white/[0.08] bg-[#1a1a14] text-[#c97d0c] focus:ring-0 cursor-pointer"
              />
              <label
                htmlFor="reminder-enabled"
                className="text-[12px] text-[#e4dfcf] select-none cursor-pointer flex items-center gap-1.5"
              >
                <AlertTriangle className="h-4 w-4 text-[#c97d0c]" /> Enable
                browser and in-app sound reminders
              </label>
            </div>
          )}
        </form>

        {/* Footer Actions */}
        <div className="flex shrink-0 items-center justify-end gap-3.5 border-t border-white/[0.06] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] border border-white/[0.06] bg-white/[0.03] px-[10px] py-2 text-[12px] font-medium text-[#9c9788] transition hover:bg-white/[0.06] hover:text-[#e4dfcf]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
            className="rounded-[8px] bg-[#c97d0c] px-5 py-2 text-[12px] font-medium text-white transition hover:bg-[#b56d09] disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Save Task"}
          </button>
        </div>
      </div>
    </div>
  );
}
