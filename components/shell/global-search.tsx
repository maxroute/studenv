"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { BookOpen, CalendarCheck, CornerDownLeft, FileText, LayoutGrid, Link2, PlaySquare, Search, SquareArrowOutUpRight, Users } from "lucide-react";
import { RanganLogo } from "@/components/rangan/rangan-launcher";
import { usePlannerTasks } from "@/hooks/use-planner-tasks";
import { useItems } from "@/hooks/useItems";
import { useRanganStore } from "@/hooks/use-rangan-store";
import { apiFetcher } from "@/lib/client/fetcher";
import { searchEverything, type SearchEntry, type SearchKind } from "@/lib/client/global-search";
import { openItemPage } from "@/lib/client/open-item-page";
import { useShellStore } from "./shell-store";
import styles from "./global-search.module.css";

type Result = SearchEntry & { run: () => void };

const ICONS: Record<SearchKind, typeof Search> = {
  screen: SquareArrowOutUpRight,
  page: FileText,
  board: LayoutGrid,
  pdf: BookOpen,
  video: PlaySquare,
  link: Link2,
  task: CalendarCheck,
  group: Users,
};
const KIND_LABELS: Record<SearchKind, string> = { screen: "Go to", page: "Page", board: "Board", pdf: "PDF", video: "Video", link: "Link", task: "Task", group: "Group" };

const SCREENS: Array<[string, string, string[]]> = [
  ["Home", "/dashboard", ["dashboard", "today"]],
  ["Library", "/shelf", ["shelf", "files", "pages"]],
  ["Planner", "/dashboard/planner", ["tasks", "calendar"]],
  ["Focus", "/dashboard/focus", ["timer", "pomodoro"]],
  ["Groups", "/dashboard/groups", ["study room", "friends"]],
  ["Flashcards", "/flashcards", ["revise", "quiz"]],
  ["Achievements", "/dashboard/achievements", ["xp", "streak"]],
  ["Profile", "/profile", ["account"]],
  ["Settings", "/settings", ["preferences", "password"]],
];

async function dataFetcher(url: string) {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Not available");
  return json.data;
}

/** Search across the whole app, opened from the sidebar, the phone header or ⌘K. */
export function GlobalSearch() {
  const open = useShellStore((state) => state.searchOpen);
  const setOpen = useShellStore((state) => state.setSearchOpen);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname, setOpen]);
  return open ? <SearchDialog onClose={() => setOpen(false)} /> : null;
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const ask = useRanganStore((state) => state.ask);
  const openRangan = useRanganStore((state) => state.openPanel);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const { items } = useItems({});
  const pages = useSWR<Array<{ id: string; title: string; updatedAt: string }>>("/api/notes", dataFetcher);
  const boards = useSWR<Array<{ id: string; title: string; updatedAt: string }>>("/api/library/boards", dataFetcher);
  const tasks = usePlannerTasks<{ id: string; title: string; category: string; status: string }>();
  const groups = useSWR<Array<{ id: string; name: string }>>("/api/study-groups", apiFetcher);

  // Typing goes straight into the box, and closing gives focus back to where it was.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    return () => before?.focus?.();
  }, []);

  const entries = useMemo<Result[]>(() => {
    const go = (href: string) => () => router.push(href);
    const itemPages = new Set(items.map((item) => item.noteId).filter(Boolean));
    return [
      ...items.map((item) => ({
        key: `item:${item.id}`,
        kind: (item.type === "note" ? "page" : item.type === "pdf" ? "pdf" : item.type === "video" ? "video" : "link") as SearchKind,
        title: item.title || "Untitled",
        keywords: [...item.tags.map((tag) => tag.name), item.excerpt ?? ""],
        updatedAt: String(item.updatedAt),
        run: () => void openItemPage(item, router.push),
      })),
      ...(pages.data ?? [])
        .filter((page) => !itemPages.has(page.id))
        .map((page) => ({ key: `page:${page.id}`, kind: "page" as const, title: page.title || "Untitled", updatedAt: page.updatedAt, run: go(`/notes/${page.id}`) })),
      ...(boards.data ?? []).map((board) => ({ key: `board:${board.id}`, kind: "board" as const, title: board.title || "Untitled board", updatedAt: board.updatedAt, run: go(`/workspaces/${board.id}`) })),
      ...(tasks.data ?? [])
        .filter((task) => task.status !== "completed" && task.status !== "cancelled")
        .map((task) => ({ key: `task:${task.id}`, kind: "task" as const, title: task.title, keywords: [task.category], run: go("/dashboard/planner") })),
      ...(groups.data ?? []).map((group) => ({ key: `group:${group.id}`, kind: "group" as const, title: group.name, run: go("/dashboard/groups") })),
      ...SCREENS.map(([title, href, keywords]) => ({ key: `screen:${href}`, kind: "screen" as const, title, keywords, run: go(href) })),
    ];
  }, [items, pages.data, boards.data, tasks.data, groups.data, router]);

  const typed = query.trim();
  const results = useMemo<Result[]>(
    () => (typed ? searchEverything(entries, typed) : entries.filter((entry) => entry.kind === "screen").slice(0, 5)),
    [entries, typed],
  );
  // Rangan is the last row: found things open on Enter, questions are asked on purpose.
  const rows = results.length + 1;
  const current = Math.min(active, rows - 1);

  useEffect(() => setActive(0), [typed]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function choose(index: number) {
    onClose();
    if (index < results.length) results[index]!.run();
    else {
      openRangan();
      if (typed) void ask(typed);
    }
  }

  const loading = !pages.data && !pages.error;

  return (
    <div className={styles.backdrop} onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Search Studenv">
        <div className={styles.inputRow}>
          <Search size={17} aria-hidden="true" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="global-search-results"
            aria-activedescendant={`global-search-${current}`}
            aria-label="Search pages, boards, files, tasks and groups"
            placeholder="Search everything, or ask Rangan…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((current + 1) % rows);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((current - 1 + rows) % rows);
              } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                choose(current);
              } else if (event.key === "Tab") event.preventDefault();
            }}
          />
          <button type="button" className={styles.close} onClick={onClose}>esc</button>
        </div>

        <ul ref={listRef} id="global-search-results" role="listbox" className={styles.results}>
          {typed && results.length === 0 ? <li className={styles.none} role="presentation">{loading ? "Still loading your things…" : "No title or tag matches."}</li> : null}
          {results.map((result, index) => {
            const Icon = ICONS[result.kind];
            return (
              <li key={result.key} id={`global-search-${index}`} role="option" aria-selected={current === index} onPointerMove={() => setActive(index)} onClick={() => choose(index)}>
                <Icon size={15} aria-hidden="true" />
                <span>{result.title}</span>
                <small>{KIND_LABELS[result.kind]}</small>
              </li>
            );
          })}
          <li id={`global-search-${results.length}`} role="option" aria-selected={current === results.length} className={styles.rangan} onPointerMove={() => setActive(results.length)} onClick={() => choose(results.length)}>
            <RanganLogo size={20} />
            <span>{typed ? `Ask Rangan: “${typed}”` : "Ask Rangan"}</span>
            <CornerDownLeft size={13} aria-hidden="true" />
          </li>
        </ul>
      </div>
    </div>
  );
}
