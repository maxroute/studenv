"use client";

import React from "react";
import Link from "next/link";
import { flushSync } from "react-dom";
import { signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import {
  BrainCircuit,
  CalendarCheck,
  LayoutDashboard,
  LogOut,
  Settings,
  Timer,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { BrandLockup } from "@/components/ui/brand-logo";
import { useDashboardNavigation } from "./dashboard-navigation";

const navSections = [
  {
    label: "Overview",
    items: [{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Learning",
    items: [
      { name: "Shelf", href: "/shelf", icon: BrainCircuit },
      { name: "Study Groups", href: "/dashboard/groups", icon: Users },
      { name: "Focus Mode", href: "/dashboard/focus", icon: Timer },
      { name: "Planner", href: "/dashboard/planner", icon: CalendarCheck },
      { name: "Achievements", href: "/dashboard/achievements", icon: Trophy },
    ],
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { beginNavigation } = useDashboardNavigation();

  React.useEffect(() => {
    navSections.flatMap((section) => section.items).forEach((item) => {
      router.prefetch(item.href);
    });
    router.prefetch("/profile");
    router.prefetch("/settings");
  }, [router]);

  function handleNavigate(
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (pathname === href) {
      return;
    }

    event.preventDefault();
    router.prefetch(href);
    flushSync(() => {
      beginNavigation(href);
    });
    window.requestAnimationFrame(() => {
      router.push(href);
    });
  }

  function warmRoute(href: string) {
    if (pathname !== href) {
      router.prefetch(href);
    }
  }

  return (
    <aside className="flex h-full w-[210px] flex-shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] px-0 pb-4 pt-6 shadow-2xl md:shadow-none">
      <div className="px-5 pb-7">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 text-[17px] font-medium tracking-[0.01em] text-[var(--amber)]"
        >
          <BrandLockup
            height={24}
            imageClassName="dashboard-brand-mark"
            textClassName="font-semibold"
            variant="badge"
            width={24}
          />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col">
        {navSections.map((section) => (
          <div key={section.label} className="mt-3">
            <div className="px-5 pb-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--muted2)]">
              {section.label}
            </div>

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    onClick={(event) => handleNavigate(event, item.href)}
                    onMouseEnter={() => router.prefetch(item.href)}
                    className={`relative flex items-center gap-2.5 px-5 py-2.5 text-[13px] transition ${
                      isActive
                        ? "bg-[var(--surface2)] text-[var(--text)]"
                        : "text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                    }`}
                  >
                    {isActive ? (
                      <span className="absolute left-0 top-1/2 h-[60%] w-[2.5px] -translate-y-1/2 rounded-r-sm bg-[var(--amber)]" />
                    ) : null}
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--border)] pt-3">
        <Link href="/profile" prefetch onClick={(event) => handleNavigate(event, "/profile")} onMouseEnter={() => warmRoute("/profile")} className={`flex w-full items-center gap-2.5 px-5 py-2.5 text-left text-[13px] transition ${pathname === "/profile" ? "bg-[var(--surface2)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"}`}>
          <User className="h-4 w-4 flex-shrink-0" />
          <span>Profile</span>
        </Link>
        <Link href="/settings" prefetch onClick={(event) => handleNavigate(event, "/settings")} onMouseEnter={() => warmRoute("/settings")} className={`flex w-full items-center gap-2.5 px-5 py-2.5 text-left text-[13px] transition ${pathname === "/settings" ? "bg-[var(--surface2)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"}`}>
          <Settings className="h-4 w-4 flex-shrink-0" />
          <span>Settings</span>
        </Link>
        <button 
          onClick={() => signOut({ callbackUrl: '/' })}
          className="flex w-full items-center gap-2.5 px-5 py-2.5 text-left text-[13px] text-[var(--muted)] transition hover:bg-[rgba(224,90,75,0.12)] hover:text-[var(--red)]"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
