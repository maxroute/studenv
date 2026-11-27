"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Bookmark, CalendarDays, FileText, Home, LayoutGrid, LibraryBig, PanelLeft, Plus, Search, Timer, Users } from "lucide-react";
import { RanganLogo } from "@/components/rangan/rangan-launcher";
import { BrandLockup } from "@/components/ui/brand-logo";
import { useItems } from "@/hooks/useItems";
import { useRanganStore } from "@/hooks/use-rangan-store";
import { openItemPage } from "@/lib/client/open-item-page";
import { shellPlace, type ShellPlace } from "@/lib/client/shell-nav";
import { AccountMenu, type ShellUser } from "./account-menu";
import { FocusClock } from "./focus-clock";
import { NewMenu } from "./new-menu";
import { useShellStore } from "./shell-store";
import { useShellShortcuts } from "./use-shell-shortcuts";
import "./shell.css";

const PLACES: Array<{ key: ShellPlace; label: string; href: string; icon: typeof Home }> = [
  { key: "home", label: "Home", href: "/dashboard", icon: Home },
  { key: "library", label: "Library", href: "/shelf", icon: LibraryBig },
  { key: "planner", label: "Planner", href: "/dashboard/planner", icon: CalendarDays },
  { key: "groups", label: "Groups", href: "/dashboard/groups", icon: Users },
];

const PLACE_TITLES: Record<ShellPlace, string> = { home: "Home", library: "Library", planner: "Planner", focus: "Focus", groups: "Groups" };

const PINNED_LIMIT = 4;
const RECENT_LIMIT = 4;

type RecentEntry = { id: string; title: string; href: string; board: boolean; updatedAt: string };

async function dataFetcher(url: string) {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Not available");
  return json.data;
}

export type ShellNavigate = (event: ReactMouseEvent<HTMLAnchorElement>, href: string) => void;

/** The desktop sidebar: the same four places everywhere, with Focus under Planner. */
export function AppSidebar({ user, onNavigate }: { user?: ShellUser; onNavigate?: ShellNavigate }) {
  const pathname = usePathname();
  const router = useRouter();
  const place = shellPlace(pathname);
  const openRangan = useRanganStore((state) => state.openPanel);
  const { items } = useItems({});
  const { data: pages } = useSWR<Array<{ id: string; title: string; updatedAt: string }>>("/api/notes", dataFetcher);
  const { data: boards } = useSWR<Array<{ id: string; title: string; updatedAt: string }>>("/api/library/boards", dataFetcher);
  const setSearchOpen = useShellStore((state) => state.setSearchOpen);
  const collapsed = useShellStore((state) => state.collapsed);
  const toggleCollapsed = useShellStore((state) => state.toggleCollapsed);
  useShellShortcuts();
  // The remembered width is applied before the slide is switched on, so a reload never animates.
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    useShellStore.getState().restoreCollapsed();
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => setAnimate(true)));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const pinned = items.filter((item) => item.starred).slice(0, PINNED_LIMIT);
  const recent = useMemo<RecentEntry[]>(
    () =>
      [
        ...(pages ?? []).map((page) => ({ id: page.id, title: page.title || "Untitled", href: `/notes/${page.id}`, board: false, updatedAt: page.updatedAt })),
        ...(boards ?? []).map((board) => ({ id: board.id, title: board.title || "Untitled board", href: `/workspaces/${board.id}`, board: true, updatedAt: board.updatedAt })),
      ]
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .slice(0, RECENT_LIMIT),
    [pages, boards],
  );

  const navLink = (key: ShellPlace, href: string, className: string, children: React.ReactNode) => (
    <Link
      key={key}
      href={href}
      title={collapsed ? PLACE_TITLES[key] : undefined}
      className={`${className}${place === key ? " active" : ""}`}
      aria-current={place === key ? "page" : undefined}
      onClick={onNavigate ? (event) => onNavigate(event, href) : undefined}
      onPointerEnter={() => router.prefetch(href)}
    >
      {children}
    </Link>
  );

  return (
    <aside className={`shell-sidebar${collapsed ? " collapsed" : ""}${animate ? " animate" : ""}`} aria-label="Main">
      <div className="shell-top">
        <Link href="/dashboard" className="shell-brand" tabIndex={collapsed ? -1 : undefined} aria-hidden={collapsed || undefined}>
          <BrandLockup height={20} imageClassName="logo-mark" textClassName="shell-brand-text" variant="badge" width={20} />
        </Link>
        <button
          type="button"
          className="shell-toggle"
          aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
          aria-expanded={!collapsed}
          title={`${collapsed ? "Open" : "Close"} sidebar (⌘\\)`}
          onClick={toggleCollapsed}
        >
          <PanelLeft size={18} aria-hidden="true" />
        </button>
      </div>

      <button type="button" className="shell-search" title="Search everything (⌘K)" aria-label="Search everything" onClick={() => setSearchOpen(true)}>
        <Search size={15} aria-hidden="true" />
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>

      <NewMenu>
        <Plus size={16} aria-hidden="true" />
        <span>New</span>
      </NewMenu>

      <nav className="shell-nav">
        {PLACES.map(({ key, label, href, icon: Icon }) => (
          <div key={key}>
            {navLink(key, href, "shell-link", <><Icon size={17} aria-hidden="true" /><span>{label}</span></>)}
            {key === "planner"
              ? navLink("focus", "/dashboard/focus", "shell-link shell-sublink", <><Timer size={14} aria-hidden="true" /><span>Focus</span><FocusClock /></>)
              : null}
          </div>
        ))}
      </nav>

      <div className="shell-lists" aria-hidden={collapsed || undefined}>
        {pinned.length ? (
          <>
            <div className="shell-label">Pinned</div>
            {pinned.map((item) => (
              <button key={item.id} type="button" className="shell-entry" title={item.title} onClick={() => void openItemPage(item, router.push)}>
                <Bookmark size={14} aria-hidden="true" />
                <span>{item.title || "Untitled"}</span>
              </button>
            ))}
          </>
        ) : null}
        {recent.length ? (
          <>
            <div className="shell-label">Recent</div>
            {recent.map((entry) => (
              <Link key={entry.href} href={entry.href} className={`shell-entry${pathname === entry.href ? " active" : ""}`} title={entry.title}>
                {entry.board ? <LayoutGrid size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
                <span>{entry.title}</span>
              </Link>
            ))}
          </>
        ) : null}
      </div>

      <button type="button" className="shell-rangan" title="Ask Rangan (⌘J)" aria-label="Ask Rangan" onClick={openRangan}>
        <RanganLogo size={22} className="shell-rangan-logo" />
        <span>Ask Rangan</span>
        <kbd>⌘J</kbd>
      </button>
      <AccountMenu user={user} placement="up" />
    </aside>
  );
}
