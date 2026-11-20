"use client";

import Image from "next/image";
import { useEffect, useState, type CSSProperties } from "react";
import { usePlaybackStore } from "@/hooks/usePlaybackStore";
import { useRanganStore } from "@/hooks/use-rangan-store";
import ranganLogo from "./rangan-logo.png";
import "./rangan.css";

/** Gap kept between the button and the video mini-player under it. */
const PLAYER_GAP_PX = 12;

/**
 * The video mini-player sits in the same corner. While it is showing, the
 * button rises above it; the full-screen player simply covers the button.
 */
function useMiniPlayerHeight(): number {
  const activeItemId = usePlaybackStore((state) => state.activeItemId);
  const isExpanded = usePlaybackStore((state) => state.isExpanded);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!activeItemId || isExpanded) {
      setHeight(0);
      return;
    }
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const card = document.querySelector(".playback-card.minimized");
      setHeight(card ? Math.max(0, window.innerHeight - card.getBoundingClientRect().top) : 0);
    };
    // The player renders in the same commit; measure once it is laid out.
    const frame = window.requestAnimationFrame(() => {
      measure();
      const card = document.querySelector(".playback-card.minimized");
      if (card) {
        observer = new ResizeObserver(measure);
        observer.observe(card);
      }
    });
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeItemId, isExpanded]);

  return height;
}

export function RanganLogo({ size, className }: { size: number; className?: string }) {
  return <Image src={ranganLogo} alt="" width={size} height={size} className={className} aria-hidden />;
}

/** Rangan's floating button in the bottom-right corner; hidden while the panel is open. */
export function RanganLauncher({ onPreload }: { onPreload: () => void }) {
  const openPanel = useRanganStore((state) => state.openPanel);
  const playerHeight = useMiniPlayerHeight();
  const style = playerHeight > 0 ? ({ "--rangan-fab-lift": `${playerHeight + PLAYER_GAP_PX}px` } as CSSProperties) : undefined;

  return (
    <button
      type="button"
      className={`rangan-fab${playerHeight > 0 ? " lifted" : ""}`}
      style={style}
      aria-label="Ask Rangan"
      title="Ask Rangan about your library"
      data-workspace-overlay="true"
      onClick={openPanel}
      onPointerEnter={onPreload}
      onFocus={onPreload}
      onTouchStart={onPreload}
    >
      <RanganLogo size={56} className="rangan-fab-logo" />
    </button>
  );
}
