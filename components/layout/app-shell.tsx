"use client";

import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { VideoPlayerOverlay } from "@/components/items/video-player-overlay";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

type AppShellProps = PropsWithChildren<{
  user: {
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    image?: string | null;
  };
}>;

export function AppShell({ user, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    <div className={`app-shell${ownsScroll ? " shelf-shell" : ""}`}>
      <Topbar user={user} onOpenSidebar={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={`app-main${ownsScroll ? " shelf-scroll-layout" : ""}`}>
        {children}
      </div>
      <VideoPlayerOverlay />
    </div>
  );
}
