"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { DashboardSidebar } from "./DashboardSidebar";
import {
  DashboardNavigationProvider,
  useDashboardNavigation,
} from "./dashboard-navigation";
import { BrandLockup } from "@/components/ui/brand-logo";
import { FocusSessionManager } from "@/components/focus/FocusSessionManager";
import { ReminderManager } from "@/components/focus/ReminderManager";

export function DashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardNavigationProvider>
      <FocusSessionManager />
      <ReminderManager />
      <DashboardLayoutFrame>{children}</DashboardLayoutFrame>
    </DashboardNavigationProvider>
  );
}

function DashboardLayoutFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { pendingHref } = useDashboardNavigation();
  const showTransition = Boolean(pendingHref && pendingHref !== pathname);

  // Keep the dashboard as the only scroll context. The shelf and other
  // non-dashboard routes retain the document's normal scrolling behavior.
  useEffect(() => {
    document.documentElement.classList.add("dashboard-scroll-locked");
    document.body.classList.add("dashboard-scroll-locked");

    return () => {
      document.documentElement.classList.remove("dashboard-scroll-locked");
      document.body.classList.remove("dashboard-scroll-locked");
    };
  }, []);

  // Close sidebar on navigation
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  // Prevent scroll when sidebar is open on mobile
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }, [isSidebarOpen]);

  return (
    <div
      className="dashboard-app-root flex h-screen min-h-0 w-full overflow-hidden bg-[#0e0e0b] text-[#e4dfcf]"
      style={{ height: "100dvh" }}
    >
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-[9990] md:z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Desktop (static) & Mobile (overlay) */}
      <div
        className={`fixed inset-y-0 left-0 z-[9999] md:z-50 transform transition-transform duration-300 ease-in-out md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <DashboardSidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col min-h-0">
        {/* Top Mobile Bar */}
        <header className="flex h-14 items-center border-b border-white/[0.065] bg-[#141410] px-4 md:hidden shrink-0">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-md text-[#9c9788] hover:bg-white/[0.04]"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="ml-3 flex items-center gap-2">
            <BrandLockup
              height={22}
              imageClassName="dashboard-brand-mark"
              textClassName="text-[16px] font-semibold text-[#c97d0c]"
              variant="badge"
              width={22}
            />
          </div>
        </header>

        {/* Main Content */}
        <main
          className="flex min-w-0 flex-1 flex-col bg-[#0e0e0b] min-h-0 overflow-y-auto overscroll-y-contain"
          style={pathname === "/dashboard" ? { paddingBottom: 112 } : undefined}
        >
          {showTransition ? (
            <DashboardRouteTransition href={pendingHref ?? ""} />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

function DashboardRouteTransition({ href }: { href: string }) {
  if (href === "/shelf" || href.startsWith("/shelf/")) {
    return (
      <div className="dashboard-shell animate-pulse">
        <main className="main">
          <div className="main-header">
            <div>
              <div className="h-8 w-56 rounded-md bg-white/[0.06]" />
              <div className="mt-3 h-4 w-36 rounded-md bg-white/[0.05]" />
            </div>
            <div className="h-10 w-52 rounded-[8px] bg-white/[0.05]" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="h-44 rounded-[14px] border border-white/[0.065] bg-[#1b1b16]"
              />
            ))}
          </div>
        </main>
        <aside className="detail-panel">
          <div className="h-48 rounded-[14px] bg-white/[0.04]" />
          <div className="mt-4 h-4 w-3/4 rounded bg-white/[0.05]" />
          <div className="mt-2 h-4 w-1/2 rounded bg-white/[0.05]" />
        </aside>
      </div>
    );
  }

  if (href.includes("/groups/") && href.endsWith("/room")) {
    return (
      <div className="app-page room-page">
        <div className="mx-auto flex w-full max-w-[1100px] animate-pulse flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
          <div className="room-bar !border-0 !px-0 !pb-0">
            <div>
              <div className="mb-3 h-4 w-40 rounded bg-white/[0.05]" />
              <div className="h-9 w-72 rounded bg-white/[0.06]" />
              <div className="mt-4 flex gap-2">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-7 w-24 rounded-full bg-white/[0.05]" />
                ))}
              </div>
            </div>
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              <div className="h-64 rounded-[18px] border border-white/[0.065] bg-[#141410]" />
              <div className="grid gap-6 md:grid-cols-2">
                <div className="h-48 rounded-[18px] border border-white/[0.065] bg-[#141410]" />
                <div className="h-48 rounded-[18px] border border-white/[0.065] bg-[#141410]" />
              </div>
              <div className="h-56 rounded-[18px] border border-white/[0.065] bg-[#141410]" />
            </div>
            <aside className="hidden h-80 rounded-[18px] border border-white/[0.05] bg-[#161614] lg:block" />
          </div>
        </div>
      </div>
    );
  }

  if (href === "/dashboard/groups") {
    return <StudyGroupsRouteTransition />;
  }

  return (
    <div className="min-h-full px-10 py-9">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="mb-8 flex items-start justify-between gap-5">
          <div>
            <div className="mb-3 h-8 w-64 rounded-md bg-white/[0.06]" />
            <div className="h-4 w-48 rounded-md bg-white/[0.05]" />
          </div>
          <div className="h-10 w-40 rounded-[8px] bg-white/[0.05]" />
        </div>
        <div className="mb-8 grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-[116px] rounded-[14px] border border-white/[0.065] bg-[#1b1b16]"
            />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
          <div className="space-y-3">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-28 rounded-[10px] border border-white/[0.065] bg-[#1b1b16]"
              />
            ))}
          </div>
          <div className="h-72 rounded-[14px] border border-white/[0.065] bg-[#1b1b16]" />
        </div>
      </div>
    </div>
  );
}

function StudyGroupsRouteTransition() {
  return (
    <div className="flex min-h-0 flex-1 animate-pulse flex-col bg-[#0e0e0d] text-[#ddd8cc]">
      <div className="flex shrink-0 flex-col gap-4 border-b border-white/[0.06] px-5 py-4 md:flex-row md:items-start md:justify-between md:px-8 md:pb-5 md:pt-6">
        <div>
          <div className="mb-3 mt-1 h-8 w-44 rounded bg-white/[0.06]" />
          <div className="h-4 w-full max-w-[360px] rounded bg-white/[0.05]" />
          <div className="mt-3 h-9 w-full rounded-[10px] bg-white/[0.04] md:hidden" />
        </div>
        <div className="flex w-full gap-2 md:w-auto">
          <div className="h-10 flex-1 rounded-[6px] border border-white/[0.08] bg-white/[0.03] md:w-36 md:flex-none" />
          <div className="h-10 flex-1 rounded-[6px] bg-[#f5a623]/70 md:w-28 md:flex-none" />
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden md:grid md:grid-cols-[minmax(206px,28vw)_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_220px]">
        <section className="absolute inset-0 flex min-h-0 flex-col bg-[#0e0e0d] md:static md:border-r md:border-white/[0.06]">
          <div className="hidden items-center justify-between border-b border-white/[0.06] px-5 py-4 md:flex">
            <div className="h-3 w-24 rounded bg-white/[0.06]" />
            <div className="h-6 w-6 rounded-[6px] bg-white/[0.05]" />
          </div>
          <div className="flex-1 overflow-hidden">
            {[0, 1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 border-b border-white/[0.05] px-4 py-3 md:px-5"
              >
                <div className="h-[46px] w-[46px] shrink-0 rounded-full bg-[#2a1f00] md:h-[34px] md:w-[34px]" />
                <div className="min-w-0 flex-1">
                  <div className="mb-2 h-4 w-3/4 rounded bg-white/[0.06]" />
                  <div className="h-3 w-full rounded bg-white/[0.04]" />
                </div>
                <div className="hidden h-3 w-9 rounded bg-white/[0.04] sm:block" />
              </div>
            ))}
          </div>
        </section>

        <section className="absolute inset-0 flex min-h-0 translate-x-full flex-col bg-[#161614] md:static md:translate-x-0">
          <div className="flex min-h-[61px] items-center gap-3 border-b border-white/[0.06] bg-[#111] px-4 py-3 md:min-h-0 md:bg-transparent md:px-5 md:py-4">
            <div className="h-6 w-6 rounded bg-[#f5a623]/20 md:hidden" />
            <div className="h-10 w-10 rounded-full bg-[#2a1f00]" />
            <div className="min-w-0 flex-1">
              <div className="mb-2 h-4 w-44 max-w-full rounded bg-white/[0.06]" />
              <div className="flex gap-2">
                <div className="h-5 w-16 rounded-full bg-white/[0.05]" />
                <div className="h-5 w-20 rounded-full bg-white/[0.05]" />
                <div className="h-5 w-16 rounded-full bg-white/[0.05]" />
              </div>
            </div>
            <div className="hidden h-8 w-24 rounded-full bg-[#c97d0c]/15 xl:block" />
            <div className="hidden h-10 w-36 rounded-[6px] bg-[#f5a623]/70 lg:block" />
          </div>
          <div className="flex flex-1 flex-col gap-4 overflow-hidden p-5">
            <div className="flex max-w-[72%] flex-col gap-2">
              <div className="h-3 w-24 rounded bg-[#f5a623]/20" />
              <div className="h-11 rounded-[14px] rounded-bl-[4px] bg-[#1e1e1b]" />
            </div>
            <div className="ml-auto flex w-[58%] flex-col gap-2">
              <div className="h-10 rounded-[14px] rounded-br-[4px] bg-[#2a1f00]" />
              <div className="ml-auto h-3 w-16 rounded bg-white/[0.04]" />
            </div>
            <div className="flex max-w-[66%] flex-col gap-2">
              <div className="h-3 w-20 rounded bg-[#f5a623]/20" />
              <div className="h-20 rounded-[12px] border border-white/[0.06] bg-[#1e1e1b]" />
            </div>
          </div>
          <div className="border-t border-white/[0.06] bg-[#111] p-3 md:p-5">
            <div className="flex items-center gap-3 rounded-[10px] bg-[#1e1e1b] p-2">
              <div className="h-8 w-8 rounded-full bg-white/[0.04]" />
              <div className="h-9 flex-1 rounded-full bg-white/[0.05]" />
              <div className="h-9 w-9 rounded-full bg-[#f5a623]/70" />
            </div>
          </div>
        </section>

        <aside className="hidden min-h-0 flex-col border-l border-white/[0.06] bg-[#0e0e0d] xl:flex">
          <div className="flex-1 space-y-5 overflow-hidden p-5">
            <div>
              <div className="mb-3 h-3 w-20 rounded bg-white/[0.05]" />
              <div className="h-12 rounded-[6px] bg-[#1e1e1b]" />
            </div>
            <div>
              <div className="mb-3 h-3 w-16 rounded bg-white/[0.05]" />
              <div className="space-y-3">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-white/[0.05]" />
                    <div className="h-3 flex-1 rounded bg-white/[0.04]" />
                  </div>
                ))}
              </div>
            </div>
            <div className="h-32 rounded-[10px] border border-white/[0.06] bg-[#161614]" />
          </div>
        </aside>
      </div>
    </div>
  );
}
