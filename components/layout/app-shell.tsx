"use client";

import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { FocusSessionManager } from "@/components/focus/FocusSessionManager";
import { VideoPlayerOverlay } from "@/components/items/video-player-overlay";
import { RanganHost } from "@/components/rangan/rangan-host";
import { AppSidebar } from "@/components/shell/app-sidebar";
import type { ShellUser } from "@/components/shell/account-menu";
import { GlobalSearch } from "@/components/shell/global-search";
import { PhoneHeader, PhoneTabBar } from "@/components/shell/phone-bars";

type AppShellProps = PropsWithChildren<{ user: ShellUser }>;

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const isShelfRoute = pathname === "/shelf";
  // Pages that own their scroll area: the document and the main area must not
  // scroll too, or on phones the first swipe moves the whole shell (top bar
  // included) before the page itself scrolls.
  const ownsScroll = isShelfRoute || pathname === "/notes" || pathname.startsWith("/notes/");

  useEffect(() => {
    document.documentElement.classList.toggle("shelf-scroll-locked", ownsScroll);
    document.body.classList.toggle("shelf-scroll-locked", ownsScroll);

    return () => {
      document.documentElement.classList.remove("shelf-scroll-locked");
      document.body.classList.remove("shelf-scroll-locked");
    };
  }, [ownsScroll]);

  return (
    <div className={`studenv-frame${ownsScroll ? " shelf-shell" : ""}`}>
      <div className="shell-sidebar-slot">
        <AppSidebar user={user} />
      </div>
      <div className="studenv-frame-column">
        <PhoneHeader user={user} />
        <div className={`app-main${ownsScroll ? " shelf-scroll-layout" : ""}`}>
          {children}
        </div>
        <PhoneTabBar />
      </div>
      {/* The timer keeps running while the student is in the library. */}
      <FocusSessionManager />
      <VideoPlayerOverlay />
      <GlobalSearch />
      <RanganHost launcher={false} />
    </div>
  );
}
