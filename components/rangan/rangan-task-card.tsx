"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check, ListTodo, Loader2, X } from "lucide-react";
import { useRanganStore, type RanganTurn } from "@/hooks/use-rangan-store";
import { dayLabel, localDay, saveDraftTasks } from "@/lib/client/study-plan";
import { TASK_PRIORITIES, type RanganTaskDraft } from "@/lib/rangan/task";

const PLANNER_PATH = "/dashboard/planner";

/** "11:59 pm" in the reader's own style; the task keeps "23:59". */
function timeLabel(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function whenLabel(task: RanganTaskDraft) {
  const today = localDay();
  const day = task.day === today ? "Today" : dayLabel(task.day);
  return task.time ? `${day}, by ${timeLabel(task.time)}` : day;
}

/**
 * Tasks Rangan drafted for the planner. The student can change each one
 * before adding: nothing is saved until "Add to planner".
 */
export function RanganTaskCard({ turn, onNavigate }: { turn: Extract<RanganTurn, { role: "task" }>; onNavigate: () => void }) {
  const router = useRouter();
  const markTasksSaved = useRanganStore((state) => state.markTasksSaved);
  const [tasks, setTasks] = useState<RanganTaskDraft[]>(turn.tasks);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const saved = turn.saved !== null;
  const ready = tasks.filter((task) => task.title.trim());

  const change = (index: number, patch: Partial<RanganTaskDraft>) =>
    setTasks((current) => current.map((task, at) => (at === index ? { ...task, ...patch } : task)));
  const remove = (index: number) => {
    setTasks((current) => current.filter((_, at) => at !== index));
    setEditing(null);
  };

  const add = async () => {
    if (saving || saved || ready.length === 0) return;
    setSaving(true);
    setFailure(null);
    const cleaned = ready.map((task) => ({ ...task, title: task.title.trim().slice(0, 200) }));
    const result = await saveDraftTasks(cleaned);
    setSaving(false);
    if (result.ok) markTasksSaved(turn.id, cleaned);
    else setFailure(result.message);
  };

  const openPlanner = () => {
    onNavigate();
    router.push(PLANNER_PATH);
  };

  return (
    <div className="rangan-plan rangan-task">
      <div className="rangan-plan-head">
        <ListTodo size={16} aria-hidden />
        <span className="rangan-plan-goal">{tasks.length === 1 ? "A task for your planner" : `${tasks.length} tasks for your planner`}</span>
      </div>
      {!saved ? <p className="rangan-plan-meta">Nothing is added until you say so. Tap a task to change it.</p> : null}

      <ul className="rangan-task-list">
        {(saved ? turn.tasks : tasks).map((task, index) =>
          editing === index && !saved ? (
            <li key={index} className="rangan-task-row editing">
              <label className="rangan-task-field wide">
                <span>Task</span>
                <input value={task.title} maxLength={200} onChange={(event) => change(index, { title: event.target.value })} autoFocus />
              </label>
              <label className="rangan-task-field">
                <span>Day</span>
                <input type="date" value={task.day} min={localDay()} onChange={(event) => event.target.value && change(index, { day: event.target.value })} />
              </label>
              <label className="rangan-task-field">
                <span>By</span>
                <input type="time" value={task.time ?? ""} onChange={(event) => change(index, { time: event.target.value || null })} />
              </label>
              <label className="rangan-task-field">
                <span>Priority</span>
                <select value={task.priority} onChange={(event) => change(index, { priority: event.target.value as RanganTaskDraft["priority"] })}>
                  {TASK_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority[0].toUpperCase() + priority.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rangan-task-edit-actions">
                <button type="button" className="rangan-chip" onClick={() => setEditing(null)} disabled={!task.title.trim()}>
                  <Check size={14} aria-hidden /> Done
                </button>
                {tasks.length > 1 ? (
                  <button type="button" className="rangan-chip" onClick={() => remove(index)}>
                    <X size={14} aria-hidden /> Remove
                  </button>
                ) : null}
              </div>
            </li>
          ) : (
            <li key={index} className="rangan-task-row">
              <button type="button" className="rangan-task-view" onClick={() => !saved && setEditing(index)} disabled={saved} aria-label={saved ? undefined : `Change ${task.title}`}>
                <span className="rangan-task-title">{task.title}</span>
                <span className="rangan-task-when">
                  {whenLabel(task)}
                  {task.priority !== "medium" ? ` · ${task.priority}` : ""}
                  {` · ${task.category}`}
                </span>
              </button>
            </li>
          ),
        )}
      </ul>

      {failure ? (
        <p className="rangan-plan-note" role="alert">
          {failure}
        </p>
      ) : null}
      {saved ? (
        <div className="rangan-plan-actions">
          <span className="rangan-plan-saved">
            <CalendarCheck size={15} aria-hidden /> Added {turn.saved} task{turn.saved === 1 ? "" : "s"} to your planner
          </span>
          <button type="button" className="rangan-chip" onClick={openPlanner}>
            Open planner
          </button>
        </div>
      ) : (
        <div className="rangan-plan-actions">
          <button type="button" className="rangan-plan-add" onClick={add} disabled={saving || ready.length === 0 || editing !== null}>
            {saving ? <Loader2 size={15} className="rangan-spin" aria-hidden /> : <Check size={15} aria-hidden />}
            Add to planner
          </button>
        </div>
      )}
    </div>
  );
}
