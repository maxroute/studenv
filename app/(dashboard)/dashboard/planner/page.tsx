"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { AnimatePresence, motion, Reorder } from "framer-motion";
import {
  Calendar,
  CalendarDays,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Edit2,
  Plus,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "react-hot-toast";
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
  repeat: string;
  color: string | null;
  icon: string | null;
  notes: string | null;
  order: number;
}

const TASKS_KEY = "/api/planner/tasks";

async function readApi<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error || "Planner request failed.");
  return json.data as T;
}

function taskDueAt(task: Task): number | null {
  if (!task.dueDate) return null;
  const date = new Date(task.dueDate);
  const [hours, minutes] = (task.dueTime || "23:59").split(":").map(Number);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes).getTime();
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

const PRIORITIES = {
  low: { label: "Low", color: "#9c9788", bg: "bg-white/[0.04] text-[#9c9788]" },
  medium: { label: "Medium", color: "#1a9e75", bg: "bg-[#1a9e75]/10 text-[#1a9e75]" },
  high: { label: "High", color: "#c97d0c", bg: "bg-[#c97d0c]/10 text-[#c97d0c]" },
  urgent: { label: "Urgent", color: "#e05555", bg: "bg-[#e05555]/10 text-[#e05555]" },
};

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
  { value: "overdue", label: "Overdue" },
  { value: "high", label: "High priority" },
];

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export default function PlannerPage() {
  const { data: tasks = [], isLoading, mutate: mutateTasks } = useSWR<Task[]>(
    TASKS_KEY,
    async (url) => {
      const res = await fetch(url);
      return readApi<Task[]>(res);
    },
    { revalidateOnFocus: true, refreshInterval: 30_000 },
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [sortBy, setSortBy] = useState("manual");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
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
        document.getElementById("planner-search")?.focus();
      }
    };

    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, []);

  const handleReorder = async (reorderedTasks: Task[]) => {
    if (sortBy !== "manual" || activeFilter !== "all" || searchQuery.trim() || selectedDate) return;
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
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);

    try {
      const res = await fetch(`/api/planner/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: targetDate.toISOString() }),
      });
      const updated = await readApi<Task>(res);
      void mutateTasks((current = []) => current.map((item) => item.id === updated.id ? updated : item), { revalidate: false });
      toast.success(days === 0 ? "Task moved to Today." : "Task moved to Tomorrow.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to shift task date.");
    }
  };

  const isToday = (dateStr: string | null) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const today = new Date();
    return d.getUTCDate() === today.getDate() && d.getUTCMonth() === today.getMonth() && d.getUTCFullYear() === today.getFullYear();
  };

  const isOverdue = (task: Task) => {
    if (task.status === "completed" || !task.dueDate) return false;
    const dueAt = taskDueAt(task);
    return dueAt !== null && dueAt < Date.now();
  };

  const isUpcoming = (task: Task) => {
    if (task.status === "completed" || !task.dueDate) return false;
    const dueAt = taskDueAt(task);
    return dueAt !== null && dueAt >= Date.now();
  };

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

    if (selectedDate) {
      filtered = filtered.filter((t) => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        return d.getUTCDate() === selectedDate.getDate() && d.getUTCMonth() === selectedDate.getMonth() && d.getUTCFullYear() === selectedDate.getFullYear();
      });
    }

    if (!selectedDate) {
      if (activeFilter === "today") filtered = filtered.filter((t) => isToday(t.dueDate) && t.status !== "completed");
      else if (activeFilter === "upcoming") filtered = filtered.filter((t) => isUpcoming(t) && !isToday(t.dueDate));
      else if (activeFilter === "completed") filtered = filtered.filter((t) => t.status === "completed");
      else if (activeFilter === "overdue") filtered = filtered.filter((t) => isOverdue(t));
      else if (activeFilter === "high") filtered = filtered.filter((t) => (t.priority === "high" || t.priority === "urgent") && t.status !== "completed");
      else if (CATEGORIES.includes(activeFilter)) filtered = filtered.filter((t) => t.category.toLowerCase() === activeFilter.toLowerCase());
    }

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
  }, [tasks, searchQuery, activeFilter, sortBy, selectedDate]);

  const stats = useMemo(() => {
    if (!tasks) return { today: 0, completed: 0, upcoming: 0, overdue: 0, percent: 0, workload: 0 };
    const todayTasks = tasks.filter((t) => isToday(t.dueDate));
    const completedTasks = tasks.filter((t) => t.status === "completed");
    const upcomingTasks = tasks.filter((t) => isUpcoming(t));
    const overdueTasks = tasks.filter((t) => isOverdue(t));
    const todayCompletedCount = todayTasks.filter((t) => t.status === "completed").length;
    const percent = todayTasks.length > 0 ? Math.round((todayCompletedCount / todayTasks.length) * 100) : 0;
    const workload = todayTasks.reduce((acc, curr) => acc + (curr.estimatedDuration || 0), 0);

    return {
      today: todayTasks.length,
      completed: completedTasks.length,
      upcoming: upcomingTasks.length,
      overdue: overdueTasks.length,
      percent,
      workload,
    };
  }, [tasks]);

  const calendarDays = useMemo(() => {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDayDate = new Date(year, month + 1, 0).getDate();
    const daysArr: Array<Date | null> = [];

    for (let i = 0; i < firstDayIndex; i += 1) daysArr.push(null);
    for (let d = 1; d <= lastDayDate; d += 1) daysArr.push(new Date(year, month, d));

    return daysArr;
  }, [currentCalendarDate]);

  const getTasksForDay = (date: Date) => {
    if (!tasks) return [];
    return tasks.filter((t) => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate);
      return d.getUTCDate() === date.getDate() && d.getUTCMonth() === date.getMonth() && d.getUTCFullYear() === date.getFullYear();
    });
  };

  const timelineTasks = useMemo(() => {
    const target = selectedDate || new Date();
    if (!tasks) return { morning: [], afternoon: [], evening: [], night: [] };

    const dayTasks = tasks.filter((t) => {
      if (!t.dueDate || t.status === "completed" || t.status === "cancelled") return false;
      const d = new Date(t.dueDate);
      return d.getUTCDate() === target.getDate() && d.getUTCMonth() === target.getMonth() && d.getUTCFullYear() === target.getFullYear();
    });

    const morning: Task[] = [];
    const afternoon: Task[] = [];
    const evening: Task[] = [];
    const night: Task[] = [];

    dayTasks.forEach((t) => {
      if (!t.dueTime) {
        morning.push(t);
        return;
      }
      const hour = parseInt(t.dueTime.split(":")[0], 10);
      if (hour >= 5 && hour < 12) morning.push(t);
      else if (hour >= 12 && hour < 17) afternoon.push(t);
      else if (hour >= 17 && hour < 21) evening.push(t);
      else night.push(t);
    });

    const timeSorter = (a: Task, b: Task) => (a.dueTime || "").localeCompare(b.dueTime || "");
    return {
      morning: morning.sort(timeSorter),
      afternoon: afternoon.sort(timeSorter),
      evening: evening.sort(timeSorter),
      night: night.sort(timeSorter),
    };
  }, [tasks, selectedDate]);

  const statusValue = STATUS_OPTIONS.some((option) => option.value === activeFilter) ? activeFilter : "all";
  const categoryValue = CATEGORIES.includes(activeFilter) ? activeFilter : "all";
  const remainingTasks = Math.max(stats.today - Math.round(stats.today * (stats.percent / 100)), 0);
  const currentMonthLabel = currentCalendarDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const openCreateDialog = () => {
    setEditingTask(null);
    setIsDialogOpen(true);
  };

  const renderTimelineLine = (label: string, toneClass: string, slotTasks: Task[]) => (
    <div className={styles.timelineLine}>
      <span className={cx(styles.timelineDot, toneClass)} />
      <span>{label}</span>
      <span className={styles.timelineText}>{slotTasks.length === 0 ? "no tasks" : `${slotTasks.length} task${slotTasks.length === 1 ? "" : "s"}`}</span>
    </div>
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
            <div className={styles.titleRow}>
              <CalendarDays className={styles.titleIcon} />
              <h1>Planner</h1>
            </div>
            <p>Organize your day and never miss an important task.</p>
          </div>

          <div className={styles.headerActions}>
            <div className={styles.dateChip}>{todayLabel}</div>
            <button className={styles.primaryButton} onClick={openCreateDialog}>
              <Plus className={styles.buttonIcon} />
              Add task
            </button>
          </div>
        </header>

        <section className={styles.statsGrid}>
          <article className={styles.statCard}>
            <span>Today's Tasks</span>
            <strong>{stats.today}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Completed</span>
            <strong className={styles.greenText}>{stats.completed}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Upcoming</span>
            <strong className={styles.purpleText}>{stats.upcoming}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Overdue</span>
            <strong className={styles.redText}>{stats.overdue}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Completion</span>
            <strong className={styles.orangeText}>{stats.percent}%</strong>
          </article>
        </section>

        <section className={styles.controlsGrid}>
          <label className={styles.compactControl}>
            <span>Status :</span>
            <select
              value={statusValue}
              onChange={(e) => {
                setSelectedDate(null);
                setActiveFilter(e.target.value);
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className={styles.compactControl}>
            <span>Category :</span>
            <select
              value={categoryValue}
              onChange={(e) => {
                setSelectedDate(null);
                setActiveFilter(e.target.value === "all" ? "all" : e.target.value);
              }}
            >
              <option value="all">All</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>

          <div className={styles.searchSortControl}>
            <div className={styles.searchBox}>
              <Search className={styles.searchIcon} />
              <input
                id="planner-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, category, priority..."
              />
            </div>
            <label className={styles.sortControl}>
              <span>Sort:</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="manual">Manual Order</option>
                <option value="priority">Priority</option>
                <option value="dueDate">Due Date</option>
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="alpha">Alphabetical</option>
              </select>
            </label>
          </div>
        </section>

        {selectedDate ? (
          <div className={styles.dateFilterNotice}>
            <span>Showing tasks for {selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            <button onClick={() => setSelectedDate(null)}>Clear date filter</button>
          </div>
        ) : null}

        <main className={styles.mainGrid}>
          <section className={styles.taskSurface}>
            {isLoading ? (
              <div className={styles.loadingStack}>
                <div />
                <div />
                <div />
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className={styles.emptyState}>
                <ClipboardCheck className={styles.emptyIcon} />
                <h2>No Tasks Scheduled</h2>
                <p>Create high-impact goals, tasks, and reminders<br />to structure your workspace.</p>
                <button className={styles.quickButton} onClick={openCreateDialog}>
                  <Plus className={styles.quickIcon} />
                  Quick add task
                </button>
              </div>
            ) : (
              <Reorder.Group axis="y" values={filteredTasks} onReorder={handleReorder} className={styles.taskList}>
                {filteredTasks.map((task) => {
                  const isExpanded = expandedTaskId === task.id;
                  const priority = PRIORITIES[task.priority as keyof typeof PRIORITIES] || PRIORITIES.medium;
                  const hasStudyTime = task.estimatedDuration && task.estimatedDuration > 0;
                  const focusProgress = hasStudyTime
                    ? Math.min(Math.round((task.trackedDuration / (task.estimatedDuration! * 60 * 1000)) * 100), 100)
                    : 0;

                  return (
                    <Reorder.Item
                      key={task.id}
                      value={task}
                      dragListener={sortBy === "manual" && activeFilter === "all" && !searchQuery.trim() && !selectedDate}
                      style={{ touchAction: "none" }}
                      className={cx(styles.taskCard, task.status === "completed" && styles.completedTask, isExpanded && styles.expandedTask)}
                    >
                      <div className={styles.taskTopline}>
                        <button
                          onClick={(e) => void handleComplete(task, e)}
                          className={cx(styles.checkButton, task.status === "completed" && styles.checkedButton)}
                          aria-label="Toggle complete"
                        >
                          <CheckCircle />
                        </button>

                        <div className={styles.taskBody} onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}>
                          <h3>{task.title}</h3>
                          <div className={styles.taskMeta}>
                            <span className={priority.bg}>{priority.label}</span>
                            <span><Tag />{task.category}</span>
                            {task.dueDate ? (
                              <span className={isOverdue(task) ? styles.overdueMeta : undefined}>
                                <Calendar />
                                {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                {task.dueTime ? ` @ ${task.dueTime}` : ""}
                              </span>
                            ) : null}
                            {task.repeat !== "none" ? <span className={styles.repeatMeta}>{task.repeat}</span> : null}
                          </div>
                        </div>

                        <div className={styles.taskActions}>
                          <button onClick={(e) => { e.stopPropagation(); setEditingTask(task); setIsDialogOpen(true); }} title="Edit"><Edit2 /></button>
                          <button onClick={(e) => void handleDuplicate(task, e)} title="Duplicate"><Copy /></button>
                          <button onClick={(e) => void handleShiftDate(task, 0, e)}>Today</button>
                          <button onClick={(e) => void handleShiftDate(task, 1, e)}>Tomorrow</button>
                          <button onClick={(e) => void handleDelete(task.id, e)} title="Delete"><Trash2 /></button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {isExpanded ? (
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
                })}
              </Reorder.Group>
            )}
          </section>

          <aside className={styles.sidebarRail}>
            <section className={styles.calendarCard}>
              <div className={styles.cardHeaderRow}>
                <h2>{currentMonthLabel}</h2>
                <div>
                  <button
                    onClick={() => {
                      const d = new Date(currentCalendarDate);
                      d.setMonth(d.getMonth() - 1);
                      setCurrentCalendarDate(d);
                    }}
                    aria-label="Previous month"
                  >
                    <ChevronLeft />
                  </button>
                  <button
                    onClick={() => {
                      const d = new Date(currentCalendarDate);
                      d.setMonth(d.getMonth() + 1);
                      setCurrentCalendarDate(d);
                    }}
                    aria-label="Next month"
                  >
                    <ChevronRight />
                  </button>
                </div>
              </div>

              <div className={styles.calendarGrid}>
                {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
                {calendarDays.map((day, index) => {
                  if (!day) return <i key={`empty-${index}`} />;

                  const isSelected = selectedDate && day.getDate() === selectedDate.getDate() && day.getMonth() === selectedDate.getMonth() && day.getFullYear() === selectedDate.getFullYear();
                  const isTodayDay = day.getDate() === new Date().getDate() && day.getMonth() === new Date().getMonth() && day.getFullYear() === new Date().getFullYear();
                  const dayTasks = getTasksForDay(day);

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(isSelected ? null : day)}
                      className={cx(isSelected && styles.selectedDay, isTodayDay && !isSelected && styles.todayDay)}
                    >
                      {day.getDate()}
                      {dayTasks.length > 0 && !isSelected ? <em /> : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className={styles.sideCard}>
              <h2>Timeline</h2>
              <div className={styles.timelineList}>
                {renderTimelineLine("Morning", styles.greenDot, timelineTasks.morning)}
                {renderTimelineLine("Afternoon", styles.orangeDot, timelineTasks.afternoon)}
                {renderTimelineLine("Evening", styles.purpleDot, timelineTasks.evening)}
                {renderTimelineLine("Night", styles.redDot, timelineTasks.night)}
              </div>
            </section>

            <section className={styles.sideCard}>
              <h2>Productivity</h2>
              <div className={styles.productivityRows}>
                <div><span>Completed today</span><strong className={styles.greenText}>{stats.percent}%</strong></div>
                <div><span>Remaining tasks</span><strong>{remainingTasks}</strong></div>
                <div><span>Overdue tasks</span><strong className={styles.redText}>{stats.overdue}</strong></div>
                <div><span>Workload today</span><strong>{stats.workload} min</strong></div>
              </div>
            </section>
          </aside>
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
    </div>
  );
}
