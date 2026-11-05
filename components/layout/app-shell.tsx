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
  const isShelfRoute = usePathname() === "/shelf";

  useEffect(() => {
    document.documentElement.classList.toggle("shelf-scroll-locked", isShelfRoute);
    document.body.classList.toggle("shelf-scroll-locked", isShelfRoute);

    return () => {
      document.documentElement.classList.remove("shelf-scroll-locked");
      document.body.classList.remove("shelf-scroll-locked");
    };
  }, [isShelfRoute]);

  return (
    <div className={`app-shell${isShelfRoute ? " shelf-shell" : ""}`}>
      <Topbar user={user} onOpenSidebar={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={`app-main${isShelfRoute ? " shelf-scroll-layout" : ""}`}>
        {children}
      </div>
      <VideoPlayerOverlay />
    </div>
  );
}
