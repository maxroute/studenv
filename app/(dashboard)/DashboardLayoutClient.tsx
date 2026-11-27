"use client";

import React, { useEffect } from "react";
import { flushSync } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  DashboardNavigationProvider,
  useDashboardNavigation,
} from "./dashboard-navigation";
import { FocusSessionManager } from "@/components/focus/FocusSessionManager";
import { ReminderManager } from "@/components/focus/ReminderManager";
import { RanganHost } from "@/components/rangan/rangan-host";
import { AppSidebar, type ShellNavigate } from "@/components/shell/app-sidebar";
import { GlobalSearch } from "@/components/shell/global-search";
import { PhoneHeader, PhoneTabBar } from "@/components/shell/phone-bars";
import { PlannerSwitch } from "@/components/shell/planner-switch";
import { PageLoader } from "@/components/ui/page-loader";

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
  const pathname = usePathname();
  const router = useRouter();
  const { pendingHref, beginNavigation } = useDashboardNavigation();
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

  // Shows the next screen's outline at once, before its code and data arrive.
  const handleNavigate: ShellNavigate = (event, href) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      pathname === href
    ) {
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
  };

  return (
    <div
      className="dashboard-app-root flex h-screen min-h-0 w-full overflow-hidden bg-[#0e0e0b] text-[#e4dfcf]"
      style={{ height: "100dvh" }}
    >
      <div className="shell-sidebar-slot">
        <AppSidebar onNavigate={handleNavigate} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col min-h-0">
        <PhoneHeader />
        <PlannerSwitch />

        {/* Main Content */}
        <main className="flex min-w-0 flex-1 flex-col bg-[#0e0e0b] min-h-0 overflow-y-auto overscroll-y-contain">
          {showTransition ? (
            <PageLoader label={openingLabel(pendingHref ?? "")} />
          ) : (
            children
          )}
        </main>
        <PhoneTabBar onNavigate={handleNavigate} />
      </div>
      <GlobalSearch />
      <RanganHost launcher={false} />
    </div>
  );
}

/** What each screen is called while it opens. */
function openingLabel(href: string) {
  if (href.startsWith("/dashboard/planner")) return "Opening your planner";
  if (href.startsWith("/dashboard/focus")) return "Opening Focus";
  if (href.startsWith("/dashboard/groups")) return "Opening your groups";
  if (href.startsWith("/shelf")) return "Opening your library";
  return "Opening Studenv";
}
