"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { shellPlace } from "@/lib/client/shell-nav";
import { FocusClock } from "./focus-clock";
import "./shell.css";

/** On phones, where the sidebar's Focus entry is not there: switches between Tasks and Focus. */
export function PlannerSwitch() {
  const place = shellPlace(usePathname());
  if (place !== "planner" && place !== "focus") return null;
  return (
    <nav className="shell-planner-switch" aria-label="Planner sections">
      <Link href="/dashboard/planner" className={place === "planner" ? "active" : ""} aria-current={place === "planner" ? "page" : undefined}>
        Tasks
      </Link>
      <Link href="/dashboard/focus" className={place === "focus" ? "active" : ""} aria-current={place === "focus" ? "page" : undefined}>
        Focus <FocusClock />
      </Link>
    </nav>
  );
}
