"use client";

import { usePlannerTasks } from "@/hooks/use-planner-tasks";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, Reorder } from "framer-motion";
import { CalendarDays, ChevronDown, ClipboardCheck, Play, Plus, Search, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { AddMenu } from "@/components/planner/add-menu";
import { PlannerFocusCard } from "@/components/planner/planner-focus-card";
import { StudyCalendar, StudyWeek } from "@/components/planner/study-calendar";
import { TaskMenu } from "@/components/planner/task-menu";
import { FilterField, FilterPopover } from "@/components/ui/filter-popover";
import { PageLoader } from "@/components/ui/page-loader";
import { TaskCheck } from "@/components/ui/task-check";
import { useStudyPlanDraft } from "@/hooks/use-study-plan-draft";
import { prepareFocusOnTask } from "@/lib/client/focus-task";
import { groupOpenTasks, isDueOn, isOverdueTask, taskDueAt } from "@/lib/client/planner-tasks";
import { dayToDueDate, moveTask, previousDates, SPREAD_DAYS, spreadTasks, type DueChange } from "@/lib/client/reschedule";
import { focusLabel } from "@/lib/client/study-calendar";
import type { StudyPlanResult } from "@/lib/services/study.service";
import { StudyPlanDialog } from "./StudyPlanDialog";
import { TaskDialog } from "./TaskDialog";
import styles from "./planner.module.css";

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
  trackedDuration: number;
  notificationEnabled: boolean;
  missedDueDates: string[];
  repeat: string;
  color: string | null;
  icon: string | null;
  notes: string | null;
  order: number;
}

async function readApi<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error || "Planner request failed.");
  return json.data as T;
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

/** The day view, or every task in one list (where they can be dragged into order). */
type PlannerView = "today" | "all";

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export default function PlannerPage() {
  const { data: tasks = [], isLoading, mutate: mutateTasks } = usePlannerTasks<Task>({ revalidateOnFocus: true, refreshInterval: 30_000 });

  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<PlannerView>("today");
  const [searchOpen, setSearchOpen] = useState(false);
  const [category, setCategory] = useState("all");
  const [highOnly, setHighOnly] = useState(false);
  const router = useRouter();
  const [sortBy, setSortBy] = useState("manual");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [draftPlan, setDraftPlan] = useState<StudyPlanResult | null>(null);
  // A plan from the Rangan chat that the student chose to adjust here.
  const pendingDraft = useStudyPlanDraft((state) => state.draft);
  useEffect(() => {
    if (!pendingDraft) return;
    setDraftPlan(useStudyPlanDraft.getState().take());
    setIsPlanOpen(true);
  }, [pendingDraft]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  // The folded lines under today's work.
  const [shown, setShown] = useState({ overdue: false, upcoming: false, done: false });
  const [monthOpen, setMonthOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  // What the last bulk move did, with the way back.
  const [moved, setMoved] = useState<{ text: string; undo: DueChange[] } | null>(null);
  const remindedTaskIds = useRef<Set<string>>(new Set());

  const playReminderSound = useCallback(() => {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.18, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.7);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.7);
    oscillator.addEventListener("ended", () => void context.close());
  }, []);

  useEffect(() => {
    try { remindedTaskIds.current = new Set(JSON.parse(localStorage.getItem("planner-reminded-tasks") || "[]")); }
    catch { remindedTaskIds.current = new Set(); }
  }, []);

  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();
      tasks.forEach((task) => {
        const dueAt = taskDueAt(task);
        if (!task.notificationEnabled || task.status === "completed" || task.status === "cancelled" ||
          dueAt === null || dueAt > now || now - dueAt > 60_000 || remindedTaskIds.current.has(task.id)) return;
        remindedTaskIds.current.add(task.id);
        localStorage.setItem("planner-reminded-tasks", JSON.stringify([...remindedTaskIds.current]));
        toast(`Due now: ${task.title}`, { icon: "?", duration: 10_000 });
        playReminderSound();
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Task due now", { body: task.title, tag: `planner-${task.id}` });
        }
      });
    };
    checkReminders();
    const timer = window.setInterval(checkReminders, 10_000);
    return () => window.clearInterval(timer);
  }, [tasks, playReminderSound]);

  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setEditingTask(null);
        setIsDialogOpen(true);
      }
      if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => document.getElementById("planner-search")?.focus(), 0);
      }
    };

    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, []);

  // New task and Make a plan, asked for from Home or the New button.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wantsTask = params.get("new") !== null;
    const wantsPlan = params.get("plan") !== null;
    if (!wantsTask && !wantsPlan) return;
    if (wantsTask) {
      setEditingTask(null);
      setIsDialogOpen(true);
    } else setIsPlanOpen(true);
    router.replace("/dashboard/planner", { scroll: false });
  }, [router]);

  // Reordering only makes sense on the whole list in its own order.
  const canReorder = view === "all" && category === "all" && !highOnly && sortBy === "manual" && !searchQuery.trim() && !selectedDate;

  const handleFocus = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!prepareFocusOnTask(task)) toast("A focus session is already running.");
    router.push("/dashboard/focus");
  };

  const handleReorder = async (reorderedTasks: Task[]) => {
    if (!canReorder) return;
    const previousTasks = tasks;
    void mutateTasks(reorderedTasks, { revalidate: false });

    try {
      const taskIds = reorderedTasks.map((t) => t.id);
      const res = await fetch("/api/planner/tasks/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds }),
      });
      await readApi(res);
      void mutateTasks();
    } catch (error) {
      void mutateTasks(previousTasks, { revalidate: false });
      toast.error(error instanceof Error ? error.message : "Failed to persist task order.");
    }
  };

  const handleComplete = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    const previousTasks = tasks;
    void mutateTasks(tasks.map((item) => item.id === task.id ? { ...item, status: nextStatus } : item), { revalidate: false });
    try {
      const res = await fetch(`/api/planner/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const updated = await readApi<Task>(res);
      void mutateTasks((current = []) => current.map((item) => item.id === updated.id ? updated : item), { revalidate: true });
      toast.success(nextStatus === "completed" ? "Task completed!" : "Task set to pending.");
    } catch (error) {
      void mutateTasks(previousTasks, { revalidate: false });
      toast.error(error instanceof Error ? error.message : "Failed to update task.");
    }
  };

  const handleDelete = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this task?")) return;
    const previousTasks = tasks;
    void mutateTasks(tasks.filter((task) => task.id !== taskId), { revalidate: false });
    try {
      const res = await fetch(`/api/planner/tasks/${taskId}`, { method: "DELETE" });
      await readApi(res);
      toast.success("Task deleted.");
    } catch (error) {
      void mutateTasks(previousTasks, { revalidate: false });
      toast.error(error instanceof Error ? error.message : "Failed to delete task.");
    }
  };

  const handleDuplicate = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch("/api/planner/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${task.title} (Copy)`,
          description: task.description,
          priority: task.priority,
          category: task.category,
          dueDate: task.dueDate,
          dueTime: task.dueTime,
          estimatedDuration: task.estimatedDuration,
          notificationEnabled: task.notificationEnabled,
          repeat: task.repeat,
          color: task.color,
          notes: task.notes,
        }),
      });
      const created = await readApi<Task>(res);
      void mutateTasks((current = []) => [...current, created], { revalidate: false });
      toast.success("Task duplicated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to duplicate task.");
    }
  };

  const handleShiftDate = async (task: Task, days: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const now = new Date();
    const change = moveTask(task, new Date(now.getFullYear(), now.getMonth(), now.getDate() + days), now);

    try {
      const res = await fetch(`/api/planner/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: change.dueDate, dueTime: change.dueTime, today: dayToDueDate(now) }),
      });
      const updated = await readApi<Task>(res);
      void mutateTasks((current = []) => current.map((item) => item.id === updated.id ? updated : item), { revalidate: false });
      toast.success(days === 0 ? "Task moved to Today." : "Task moved to Tomorrow.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to shift task date.");
    }
  };

  /** Gives many tasks new dates in one request; returns whether it worked. */
  const reschedule = async (changes: DueChange[]) => {
    const byId = new Map(changes.map((change) => [change.id, change]));
    const previousTasks = tasks;
    setMoving(true);
    void mutateTasks(tasks.map((task) => ({ ...task, ...byId.get(task.id) })), { revalidate: false });
    try {
      const res = await fetch("/api/planner/tasks/reschedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes, today: dayToDueDate(new Date()) }),
      });
      await readApi(res);
      void mutateTasks();
      return true;
    } catch (error) {
      void mutateTasks(previousTasks, { revalidate: false });
      toast.error(error instanceof Error ? error.message : "The tasks could not be moved.");
      return false;
    } finally {
      setMoving(false);
    }
  };

  const clearBacklog = async (overdue: Task[], spread: boolean) => {
    const now = new Date();
    const changes = spread ? spreadTasks(overdue, now) : overdue.map((task) => moveTask(task, now, now));
    const count = `${overdue.length} task${overdue.length === 1 ? "" : "s"}`;
    const undo = previousDates(overdue);
    setMoved(null);
    if (await reschedule(changes)) setMoved({ text: spread ? `Spread ${count} over ${SPREAD_DAYS} days.` : `Moved ${count} to today.`, undo });
  };

  const undoMove = async () => {
    if (!moved) return;
    if (await reschedule(moved.undo)) setMoved(null);
  };

  const isOverdue = (task: Task) => isOverdueTask(task, Date.now());

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    let filtered = [...tasks];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          (t.notes || "").toLowerCase().includes(q),
      );
    }

    if (category !== "all") filtered = filtered.filter((t) => t.category.toLowerCase() === category.toLowerCase());
    if (highOnly) filtered = filtered.filter((t) => t.priority === "high" || t.priority === "urgent");

    if (selectedDate) filtered = filtered.filter((t) => isDueOn(t.dueDate, selectedDate));

    if (sortBy === "priority") {
      const priorityOrder: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
      filtered.sort((a, b) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0));
    } else if (sortBy === "dueDate") {
      filtered.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
    } else if (sortBy === "newest") filtered.sort((a, b) => b.id.localeCompare(a.id));
    else if (sortBy === "oldest") filtered.sort((a, b) => a.id.localeCompare(b.id));
    else if (sortBy === "alpha") filtered.sort((a, b) => a.title.localeCompare(b.title));

    return filtered;
  }, [tasks, searchQuery, category, highOnly, sortBy, selectedDate]);

  // Searching, filtering, picking a day or asking for everything gives one plain list.
  const filtering = searchQuery.trim() !== "" || category !== "all" || highOnly || sortBy !== "manual";
  const asList = selectedDate !== null || view === "all" || filtering;

  const day = useMemo(() => {
    const groups = groupOpenTasks(tasks, new Date());
    const find = (key: string) => groups.find((group) => group.key === key)?.tasks ?? [];
    return {
      today: find("today"),
      overdue: find("overdue"),
      upcoming: groups.filter((group) => group.key === "tomorrow" || group.key === "later" || group.key === "someday"),
      done: tasks.filter((task) => task.status === "completed"),
    };
  }, [tasks]);
  const upcomingCount = day.upcoming.reduce((total, group) => total + group.tasks.length, 0);
  const plannedMs = day.today.reduce((total, task) => total + (task.estimatedDuration ?? 0), 0) * 60_000;

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    setCategory("all");
    setHighOnly(false);
    setSortBy("manual");
    setView("today");
  };

  const shortDate = (date: Date) => date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
  const title = selectedDate ? shortDate(selectedDate) : view === "all" ? "All tasks" : filtering ? "Search" : "Today";
  const subtitle = asList
    ? `${filteredTasks.length} task${filteredTasks.length === 1 ? "" : "s"}`
    : [shortDate(new Date()), plannedMs > 0 ? `${focusLabel(plannedMs)} planned` : null].filter(Boolean).join(" · ");

  const openCreateDialog = () => {
    setEditingTask(null);
    setIsDialogOpen(true);
  };

  const renderTask = (task: Task, next = false) => {
    const isExpanded = expandedTaskId === task.id;
    const hasStudyTime = task.estimatedDuration && task.estimatedDuration > 0;
    const focusProgress = hasStudyTime
      ? Math.min(Math.round((task.trackedDuration / (task.estimatedDuration! * 60 * 1000)) * 100), 100)
      : 0;

    return (
      <Reorder.Item
        key={task.id}
        value={task}
        dragListener={canReorder}
        // A finger scrolls the list unless the cards can be dragged.
        style={{ touchAction: canReorder ? "none" : "auto" }}
        className={cx(styles.taskRow, next && styles.nextTask, isExpanded && styles.openRow, task.status === "completed" && styles.completedTask)}
      >
        <div className={styles.taskTopline}>
          <TaskCheck
            checked={task.status === "completed"}
            label={task.status === "completed" ? `Mark not done: ${task.title}` : `Mark done: ${task.title}`}
            onToggle={(e) => void handleComplete(task, e)}
          />

          <div
            className={styles.taskBody}
            role="button"
            tabIndex={0}
            aria-expanded={isExpanded}
            onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              setExpandedTaskId(isExpanded ? null : task.id);
            }}
          >
            <h3>{task.title}</h3>
            <div className={styles.taskMeta}>
              {task.dueDate ? (
                <span className={isOverdue(task) ? styles.overdueMeta : undefined}>
                  {[
                    isDueOn(task.dueDate, new Date()) ? "Today" : new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
                    task.dueTime,
                  ].filter(Boolean).join(", ")}
                </span>
              ) : null}
              <span>{task.category.charAt(0).toUpperCase() + task.category.slice(1)}</span>
              {task.estimatedDuration ? <span>{task.estimatedDuration} min</span> : null}
              {task.priority === "high" || task.priority === "urgent" ? (
                <span className={task.priority === "urgent" ? styles.urgentMeta : styles.highMeta}>{task.priority === "urgent" ? "Urgent" : "High priority"}</span>
              ) : null}
              {task.repeat !== "none" ? <span>Repeats {task.repeat}</span> : null}
            </div>
          </div>

          {task.status !== "completed" ? (
            <button type="button" className={next ? styles.startButton : styles.focusButton} onClick={(e) => handleFocus(task, e)} aria-label={`Focus on ${task.title}`}>
            <Play aria-hidden="true" />
            {next ? <span>Start</span> : null}
          </button>
          ) : null}

          <div className={styles.more}>
          <TaskMenu
            title={task.title}
            onEdit={(e) => {
              e.stopPropagation();
              setEditingTask(task);
              setIsDialogOpen(true);
            }}
            onDuplicate={(e) => void handleDuplicate(task, e)}
            onToday={(e) => void handleShiftDate(task, 0, e)}
            onTomorrow={(e) => void handleShiftDate(task, 1, e)}
            onDelete={(e) => void handleDelete(task.id, e)}
          />
        </div>
        </div>

        <AnimatePresence>
          {isExpanded && (task.description || hasStudyTime || task.notes) ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={styles.expandedPanel}
            >
              {task.description ? <p>{task.description}</p> : null}
              {hasStudyTime ? (
                <div className={styles.progressBlock}>
                  <div>
                    <span>Focus Study Duration:</span>
                    <strong>{Math.round(task.trackedDuration / 60000)} Min / {task.estimatedDuration} Min ({focusProgress}%)</strong>
                  </div>
                  <div className={styles.progressTrack}><span style={{ width: `${focusProgress}%` }} /></div>
                </div>
              ) : null}
              {task.notes ? (
                <div className={styles.notesBlock}>
                  <h4>Notes / Checklists</h4>
                  <p>{task.notes}</p>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Reorder.Item>
    );
  };

  const renderList = (list: Task[], highlight = false) => (
    <Reorder.Group axis="y" values={list} onReorder={handleReorder} className={styles.taskList}>
      {list.map((task, index) => renderTask(task, highlight && index === 0))}
    </Reorder.Group>
  );

  const fold = (key: keyof typeof shown, label: React.ReactNode, action: string) => (
    <button type="button" className={styles.foldLine} aria-expanded={shown[key]} onClick={() => setShown((current) => ({ ...current, [key]: !current[key] }))}>
      <span className={styles.foldLabel}>{label}</span>
      <span className={styles.foldAction}>
        {shown[key] ? "Hide" : action}
        <ChevronDown size={14} aria-hidden="true" />
      </span>
    </button>
  );

  return (
    <div className={styles.plannerPage}>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className={styles.plannerFrame}
      >
        <header className={styles.header}>
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={cx(styles.iconButton, searchOpen && styles.iconOn)}
              aria-label={searchOpen ? "Close search and filters" : "Search and filters"}
              aria-expanded={searchOpen}
              onClick={() => {
                if (searchOpen) closeSearch();
                else {
                  setSearchOpen(true);
                  window.setTimeout(() => document.getElementById("planner-search")?.focus(), 0);
                }
              }}
            >
              <Search size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={cx(styles.iconButton, monthOpen && styles.iconOn)}
              aria-label={monthOpen ? "Show only this week" : "Show whole month"}
              aria-pressed={monthOpen}
              onClick={() => setMonthOpen((open) => !open)}
            >
              <CalendarDays size={17} aria-hidden="true" />
            </button>
            <AddMenu onNewTask={openCreateDialog} onPlan={() => setIsPlanOpen(true)} />
          </div>
        </header>

        {searchOpen ? (
          <div className={styles.filterRow}>
            <div className={styles.searchBox}>
              <Search className={styles.searchIcon} />
              <input
                id="planner-search"
                aria-label="Search tasks"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeSearch();
                }}
                placeholder="Search tasks..."
              />
            </div>
            <FilterPopover
              active={[view === "all", category !== "all", highOnly, sortBy !== "manual"].filter(Boolean).length}
              onClear={() => {
                setView("today");
                setCategory("all");
                setHighOnly(false);
                setSortBy("manual");
              }}
            >
              <FilterField label="Show">
                <select
                  value={view}
                  onChange={(e) => {
                    setSelectedDate(null);
                    setView(e.target.value === "all" ? "all" : "today");
                  }}
                >
                  <option value="today">Today</option>
                  <option value="all">All tasks (drag to reorder)</option>
                </select>
              </FilterField>
              <FilterField label="Category">
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="all">All</option>
                  {CATEGORIES.map((entry) => (
                    <option key={entry} value={entry}>{entry}</option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Priority">
                <select value={highOnly ? "high" : "all"} onChange={(e) => setHighOnly(e.target.value === "high")}>
                  <option value="all">Any priority</option>
                  <option value="high">High and urgent only</option>
                </select>
              </FilterField>
              <FilterField label="Sort by">
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="manual">Manual Order</option>
                  <option value="priority">Priority</option>
                  <option value="dueDate">Due Date</option>
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="alpha">Alphabetical</option>
                </select>
              </FilterField>
            </FilterPopover>
          </div>
        ) : null}

        <main className={styles.column}>
          <PlannerFocusCard />

          {monthOpen ? (
            <StudyCalendar tasks={tasks} selectedDate={selectedDate} onSelect={setSelectedDate} />
          ) : (
            <StudyWeek tasks={tasks} selectedDate={selectedDate} onSelect={setSelectedDate} />
          )}

          {moved ? (
            <div className={styles.movedNotice} role="status">
              <span>{moved.text}</span>
              <button type="button" disabled={moving} onClick={() => void undoMove()}>Undo</button>
              <button type="button" aria-label="Dismiss" onClick={() => setMoved(null)}><X size={14} aria-hidden="true" /></button>
            </div>
          ) : null}

          {isLoading ? (
            <PageLoader label="Opening your planner" />
          ) : tasks.length === 0 || (asList && filteredTasks.length === 0) ? (
            <div className={styles.emptyState}>
              <ClipboardCheck className={styles.emptyIcon} />
              <h2>{tasks.length === 0 ? "No Tasks Scheduled" : "Nothing here"}</h2>
              <p>{tasks.length === 0 ? "Create goals, tasks and reminders to plan your study." : "Try another day, or clear the search and filters."}</p>
              {selectedDate ? (
                <button type="button" className={styles.quietButton} onClick={() => setSelectedDate(null)}>Back to today</button>
              ) : null}
              <button className={styles.quickButton} onClick={openCreateDialog}>
                <Plus className={styles.quickIcon} />
                Quick add task
              </button>
            </div>
          ) : asList ? (
            <section>
              {selectedDate ? (
                <button type="button" className={styles.quietButton} onClick={() => setSelectedDate(null)}>Back to today</button>
              ) : null}
              {renderList(filteredTasks)}
            </section>
          ) : (
            <>
              <section aria-label="Due today">
                {day.today.length ? renderList(day.today, true) : <p className={styles.clearDay}>Nothing due today.</p>}
              </section>

              <div className={styles.folds}>
                {day.overdue.length ? (
                  <section>
                    {fold("overdue", <><i className={styles.attention} aria-hidden="true" />{day.overdue.length} overdue task{day.overdue.length === 1 ? "" : "s"}</>, "Review")}
                    {shown.overdue ? (
                      <>
                        <div className={styles.backlog}>
                          <button type="button" disabled={moving} onClick={() => void clearBacklog(day.overdue, false)}>Move to today</button>
                          <button type="button" disabled={moving} onClick={() => void clearBacklog(day.overdue, true)}>Spread over {SPREAD_DAYS} days</button>
                        </div>
                        {renderList(day.overdue)}
                      </>
                    ) : null}
                  </section>
                ) : null}
                {upcomingCount ? (
                  <section>
                    {fold("upcoming", `${upcomingCount} upcoming`, "Show")}
                    {shown.upcoming
                      ? day.upcoming.map((group) => (
                          <div key={group.key}>
                            <h2 className={styles.groupLabel}>{group.label}</h2>
                            {renderList(group.tasks)}
                          </div>
                        ))
                      : null}
                  </section>
                ) : null}
                {day.done.length ? (
                  <section>
                    {fold("done", `${day.done.length} done`, "Show")}
                    {shown.done ? renderList(day.done) : null}
                  </section>
                ) : null}
              </div>
            </>
          )}
        </main>
      </motion.div>

      <TaskDialog
        open={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setEditingTask(null);
        }}
        onSave={() => void mutateTasks()}
        task={editingTask}
      />

      <StudyPlanDialog
        open={isPlanOpen}
        initialPlan={draftPlan}
        onClose={() => {
          setIsPlanOpen(false);
          setDraftPlan(null);
        }}
        onSaved={() => void mutateTasks()}
      />
    </div>
  );
}
