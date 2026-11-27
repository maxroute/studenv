"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import toast from "react-hot-toast";
import { ArrowRight, FileText, Flame, LayoutGrid, Play } from "lucide-react";
import { FocusClock } from "@/components/shell/focus-clock";
import { PageLoader } from "@/components/ui/page-loader";
import { TaskCheck } from "@/components/ui/task-check";
import { useFocusHistory } from "@/hooks/use-focus-history";
import { useFocusStore } from "@/hooks/useFocusStore";
import { useItems } from "@/hooks/useItems";
import { usePlannerTasks } from "@/hooks/use-planner-tasks";
import { prepareFocusOnTask } from "@/lib/client/focus-task";
import { focusTotals, oldestOverdueLabel, weekSoFar } from "@/lib/client/home-summary";
import { openItemPage } from "@/lib/client/open-item-page";
import { groupOpenTasks } from "@/lib/client/planner-tasks";
import { focusLabel } from "@/lib/client/study-calendar";
import styles from "./home.module.css";

type HomeTask = {
  id: string;
  title: string;
  category: string;
  status: string;
  dueDate: string | null;
  dueTime: string | null;
  estimatedDuration: number | null;
};

type ContinueEntry = { key: string; kind: "Page" | "Board" | "PDF" | "Video" | "Link"; title: string; updatedAt: string; open: () => void };

const CONTINUE_LIMIT = 2;

/** The student's first name and streak. The fuller numbers live on Focus and Achievements. */
async function viewerFetcher(url: string): Promise<{ viewer?: { firstName?: string }; stats?: { streak: number } }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Not available");
  return response.json();
}

async function dataFetcher(url: string) {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Not available");
  return json.data;
}

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function ago(value: string, now: Date) {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return minutes < 2 ? "just now" : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  return days < 7 ? `${days} days ago` : new Date(value).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

const taskDetail = (task: HomeTask) =>
  [task.dueTime, task.estimatedDuration ? `${task.estimatedDuration} min` : null, task.category.charAt(0).toUpperCase() + task.category.slice(1)].filter(Boolean).join(" · ");

/** Home answers: what needs attention, and what should I do now? The Planner holds the rest. */
export function HomeScreen() {
  const router = useRouter();
  const viewer = useSWR("/api/dashboard", viewerFetcher);
  const tasks = usePlannerTasks<HomeTask>();
  const pages = useSWR<Array<{ id: string; title: string; updatedAt: string }>>("/api/notes", dataFetcher);
  const boards = useSWR<Array<{ id: string; title: string; updatedAt: string }>>("/api/library/boards", dataFetcher);
  const { items } = useItems({});
  const session = useFocusStore((state) => state.activeSession);
  // The date and greeting follow the student's clock, so they wait for the browser.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const week = weekSoFar(now ?? new Date());
  const history = useFocusHistory(week.from, week.to);

  const { next, overdue } = useMemo(() => {
    const groups = now ? groupOpenTasks(tasks.data ?? [], now) : [];
    const find = (key: string) => groups.find((group) => group.key === key)?.tasks ?? [];
    // An overdue task never stands in as the next one: it has its own line.
    const late = find("overdue");
    return { next: find("today")[0] ?? null, overdue: { count: late.length, since: now ? oldestOverdueLabel(late, now) : null } };
  }, [tasks.data, now]);

  const continueEntries = useMemo<ContinueEntry[]>(() => {
    const entries: ContinueEntry[] = [
      ...(pages.data ?? []).map((page) => ({ key: `page:${page.id}`, kind: "Page" as const, title: page.title || "Untitled", updatedAt: page.updatedAt, open: () => router.push(`/notes/${page.id}`) })),
      ...(boards.data ?? []).map((board) => ({ key: `board:${board.id}`, kind: "Board" as const, title: board.title || "Untitled board", updatedAt: board.updatedAt, open: () => router.push(`/workspaces/${board.id}`) })),
      // Pages are already listed above; these are the saved files and links.
      ...items
        .filter((item) => item.type !== "note")
        .map((item) => ({
          key: `item:${item.id}`,
          kind: item.type === "pdf" ? ("PDF" as const) : item.type === "video" ? ("Video" as const) : ("Link" as const),
          title: item.title || "Untitled",
          updatedAt: String(item.updatedAt ?? item.createdAt),
          open: () => void openItemPage(item, router.push),
        })),
    ];
    return entries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, CONTINUE_LIMIT);
  }, [pages.data, boards.data, items, router]);

  async function complete(task: HomeTask) {
    const previous = tasks.data;
    void tasks.mutate(previous?.map((entry) => (entry.id === task.id ? { ...entry, status: "completed" } : entry)), { revalidate: false });
    try {
      const response = await fetch(`/api/planner/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error(json?.error ?? "The task could not be updated.");
      toast.success("Task completed!");
      void tasks.mutate();
    } catch (error) {
      void tasks.mutate(previous, { revalidate: false });
      toast.error(error instanceof Error ? error.message : "The task could not be updated.");
    }
  }

  function start(task: HomeTask) {
    if (!prepareFocusOnTask(task)) toast("A focus session is already running.");
    router.push("/dashboard/focus");
  }

  const name = viewer.data?.viewer?.firstName;
  const paused = Boolean(session?.pausedAt);
  const streak = viewer.data?.stats?.streak;
  // Shown only when every number is known, so none is ever a placeholder zero.
  const stats = now && streak !== undefined && !history.loading && !history.error ? { streak, ...focusTotals(history.days, now) } : null;

  return (
    <div className={styles.home}>
      <header>
        <h1>
          {now ? greeting(now.getHours()) : "Welcome back"}
          {name ? `, ${name}` : ""}
        </h1>
        <p>{now ? now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" }) : " "}</p>
        <div className={styles.statsSlot}>
          {stats ? (
            <Link href="/dashboard/planner" className={styles.stats} aria-label="Your study progress. Opens the Planner.">
              {stats.streak === 0 && stats.weekMs === 0 ? (
                <span>Start a focus session to begin your streak.</span>
              ) : (
                <>
                  <span>
                    <Flame size={14} aria-hidden="true" />
                    <b>{stats.streak}</b> day streak
                  </span>
                  <span>
                    <b>{focusLabel(stats.todayMs)}</b> today
                  </span>
                  <span>
                    <b>{focusLabel(stats.weekMs)}</b> this week
                  </span>
                </>
              )}
            </Link>
          ) : null}
        </div>
      </header>

      {overdue.count > 0 ? (
        <Link href="/dashboard/planner" className={styles.alert}>
          <i aria-hidden="true" />
          <span>
            <strong>
              {overdue.count} task{overdue.count === 1 ? " is" : "s are"} overdue
            </strong>
            {overdue.since ? <small>Oldest from {overdue.since}</small> : null}
          </span>
          <em>
            Review <ArrowRight size={13} aria-hidden="true" />
          </em>
        </Link>
      ) : null}

      <section aria-labelledby="homeNext">
        <h2 id="homeNext">{session ? (paused ? "Focus paused" : "In focus") : "Next up"}</h2>
        {session ? (
          <div className={styles.card}>
            <div className={styles.cardText}>
              <strong>{session.goal}</strong>
              <small><FocusClock /> left</small>
            </div>
            <Link href="/dashboard/focus" className={styles.start}>
              <Play size={13} aria-hidden="true" />
              {paused ? "Resume focus" : "Open focus"}
            </Link>
          </div>
        ) : tasks.error && !tasks.data ? (
          <div className={styles.card}>
            <p className={styles.quiet}>Your tasks could not be loaded.</p>
            <button type="button" className={styles.plain} onClick={() => void tasks.mutate()}>Try again</button>
          </div>
        ) : !tasks.data || !now ? (
          <div className={styles.loading}>
            <PageLoader label="Opening your day" />
          </div>
        ) : next ? (
          <div className={styles.card}>
            <TaskCheck checked={false} label={`Mark done: ${next.title}`} onToggle={() => void complete(next)} />
            <div className={styles.cardText}>
              <strong>{next.title}</strong>
              <small>{taskDetail(next)}</small>
            </div>
            <button type="button" className={styles.start} onClick={() => start(next)} aria-label={`Start focus on ${next.title}`}>
              <Play size={13} aria-hidden="true" />
              Start
            </button>
          </div>
        ) : (
          <div className={styles.card}>
            <p className={styles.quiet}>Nothing is due today.</p>
            <Link href="/dashboard/planner?plan=1" className={styles.plain}>Plan my day</Link>
          </div>
        )}
      </section>

      {continueEntries.length ? (
        <section aria-labelledby="homeContinue">
          <h2 id="homeContinue">Continue</h2>
          <ul className={styles.rows}>
            {continueEntries.map((entry) => (
              <li key={entry.key}>
                <button type="button" onClick={entry.open}>
                  {entry.kind === "Board" ? <LayoutGrid size={15} aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}
                  <span>{entry.title}</span>
                  <small>
                    {entry.kind}
                    {now ? ` · ${ago(entry.updatedAt, now)}` : ""}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
