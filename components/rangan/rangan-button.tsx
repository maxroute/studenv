"use client";

import { Sparkles } from "lucide-react";
import { useRanganStore } from "@/hooks/use-rangan-store";
import { preloadRanganPanel } from "./rangan-host";
import "./rangan.css";

type Props = {
  /** Class names of the toolbar the button sits in, so it matches its neighbours. */
  className: string;
  /** Class name of the label, hidden on narrow screens by the toolbar's own rules. */
  labelClassName?: string;
  iconClassName?: string;
};

/** Opens or closes Rangan. */
export function RanganButton({ className, labelClassName, iconClassName }: Props) {
  const open = useRanganStore((state) => state.open);
  const toggle = useRanganStore((state) => state.toggle);
  return (
    <button
      type="button"
      className={className}
      aria-label="Ask Rangan"
      aria-expanded={open}
      title="Ask Rangan about your library"
      onClick={toggle}
      onPointerEnter={preloadRanganPanel}
      onFocus={preloadRanganPanel}
      onTouchStart={preloadRanganPanel}
    >
      <Sparkles className={iconClassName} size={16} aria-hidden />
      <span className={labelClassName}>Rangan</span>
    </button>
  );
}
