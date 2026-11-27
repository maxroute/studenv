"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, LibraryBig, Plus, Search, Timer, Users } from "lucide-react";
import { BrandLockup } from "@/components/ui/brand-logo";
import { RanganLogo } from "@/components/rangan/rangan-launcher";
import { useFocusStore } from "@/hooks/useFocusStore";
import { useRanganStore } from "@/hooks/use-rangan-store";
import { hidesPhoneBars, shellPlace, type ShellPlace } from "@/lib/client/shell-nav";
import { AccountMenu, type ShellUser } from "./account-menu";
import { FocusClock } from "./focus-clock";
import { NewMenu } from "./new-menu";
import { useShellStore } from "./shell-store";
import type { ShellNavigate } from "./app-sidebar";
import "./shell.css";

/** The phone header: logo, search, New and the account menu. */
export function PhoneHeader({ user }: { user?: ShellUser }) {
  const pathname = usePathname();
  const setSearchOpen = useShellStore((state) => state.setSearchOpen);
  if (hidesPhoneBars(pathname)) return null;
  return (
    <header className="shell-phone-header">
      <Link href="/dashboard" className="shell-brand">
        <BrandLockup height={20} imageClassName="logo-mark" textClassName="shell-brand-text" variant="badge" width={20} />
      </Link>
      <button type="button" className="shell-icon-button" aria-label="Search everything" onClick={() => setSearchOpen(true)}>
        <Search size={18} aria-hidden="true" />
      </button>
      <NewMenu>
        <Plus size={18} aria-hidden="true" />
        <span className="shell-sr-only">New</span>
      </NewMenu>
      <AccountMenu user={user} placement="down" />
    </header>
  );
}

/** The phone tab bar: the sidebar's places in the same order, with Rangan in the middle. */
export function PhoneTabBar({ onNavigate }: { onNavigate?: ShellNavigate }) {
  const pathname = usePathname();
  const place = shellPlace(pathname);
  const openRangan = useRanganStore((state) => state.openPanel);
  const focusRunning = useFocusStore((state) => state.activeSession !== null);
  if (hidesPhoneBars(pathname)) return null;

  const tab = (key: ShellPlace, href: string, label: string, Icon: typeof Home) => {
    // Focus lives under Planner, so the Planner tab stays lit on it.
    const active = place === key || (key === "planner" && place === "focus");
    return (
      <Link
        href={href}
        className={`shell-tab${active ? " active" : ""}`}
        aria-current={place === key ? "page" : undefined}
        onClick={onNavigate ? (event) => onNavigate(event, href) : undefined}
      >
        <Icon size={20} aria-hidden="true" />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="shell-phone-bottom">
      {/* Home and Focus already show the time on the page itself. */}
      {focusRunning && place !== "focus" && place !== "home" ? (
        <Link href="/dashboard/focus" className="shell-focus-strip">
          <Timer size={14} aria-hidden="true" />
          <span>Focus session</span>
          <FocusClock />
        </Link>
      ) : null}
      <nav className="shell-tabbar" aria-label="Main">
        {tab("home", "/dashboard", "Home", Home)}
        {tab("library", "/shelf", "Library", LibraryBig)}
        <button type="button" className="shell-tab shell-tab-rangan" onClick={openRangan}>
          <span className="shell-tab-orb"><RanganLogo size={30} /></span>
          <span>Rangan</span>
        </button>
        {tab("planner", "/dashboard/planner", "Planner", CalendarDays)}
        {tab("groups", "/dashboard/groups", "Groups", Users)}
      </nav>
    </div>
  );
}
