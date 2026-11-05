"use client";

import type { PropsWithChildren } from "react";
import { useState } from "react";
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
  const isShelfRoute = usePathname() === "/shelf";

  return (
    <div className={`app-shell${isShelfRoute ? " shelf-shell" : ""}`}>
      <Topbar user={user} onOpenSidebar={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={`app-main${isShelfRoute ? " shelf-scroll-layout" : ""}`}>{children}</div>
      <VideoPlayerOverlay />
    </div>
  );
}
