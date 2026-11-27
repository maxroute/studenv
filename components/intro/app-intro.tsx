"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { INTRO_COOKIE, INTRO_END_FRAME, INTRO_FPS, INTRO_STILL_FRAME, INTRO_WORDS, introFrame, logoDisc } from "@/lib/client/intro";
import { ARROWS, HEADS } from "@/components/ui/page-loader";
import loader from "@/components/ui/page-loader.module.css";
import { useIntroPreload } from "./use-intro-preload";
import styles from "./app-intro.module.css";

/** A busy moment slows the animation rather than making it jump. */
const LONGEST_STEP_MS = 50;
/** How long the app's own logo takes to take over at the end. */
const HANDOVER_MS = 200;
const STILL_MS = 900;
/** The height of one rolling word, in em. The same as in the styles. */
const WORD_LINE = 1.3;
const MAIN_SCREENS = ["/dashboard", "/shelf", "/dashboard/planner", "/dashboard/groups"];

/** Stays set while the app is open, so moving between its sections doesn't replay the intro. */
let played = false;

/** `show` comes from the server, so the first thing painted is already the intro (or isn't). */
export function AppIntro({ show }: { show: boolean }) {
  const [active, setActive] = useState(() => show && !(typeof window !== "undefined" && played));
  return active ? <Intro onDone={() => setActive(false)} /> : null;
}

/** The logo in the sidebar or the phone's top bar, whichever is on screen. */
function visibleLogo(): DOMRect | null {
  for (const mark of Array.from(document.querySelectorAll(".shell-brand .brand-mark"))) {
    const box = mark.getBoundingClientRect();
    const brand = mark.closest(".shell-brand")?.getBoundingClientRect();
    // A collapsed sidebar squeezes the brand to nothing but leaves the image its size.
    if (box.width > 0 && brand && brand.width >= box.width) return box;
  }
  return null;
}

function Intro({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  useIntroPreload();
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const roll = useRef<HTMLDivElement>(null);
  const firstWord = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    played = true;
    document.cookie = `${INTRO_COOKIE}=seen; path=/; SameSite=Lax`;
    for (const screen of MAIN_SCREENS) router.prefetch(screen);
  }, [router]);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = still ? INTRO_STILL_FRAME : 0;
    let last: number | null = null;
    let request = 0;
    let leaving = 0;

    const paint = () => {
      const box = visibleLogo();
      const now = introFrame(frame, window.innerWidth, window.innerHeight, box ? logoDisc(box) : null);
      const { x, y, size } = now.logo;
      if (mark.current) mark.current.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px) scale(${size / 100})`;
      if (field.current) field.current.style.clipPath = `circle(${now.fieldRadius}px at ${x}px ${y}px)`;
      if (text.current) text.current.style.opacity = String(now.textOpacity);
      if (roll.current) roll.current.style.top = `${now.wordsTop}px`;
      if (firstWord.current) firstWord.current.style.marginTop = `${-now.wordShift * WORD_LINE}em`;
      if (counter.current) counter.current.textContent = String(Math.round(now.progress * 100)).padStart(3, "0");
      if (bar.current) bar.current.style.width = `${now.progress * 100}%`;
      root.current?.classList.add(styles.playing);
      return now.finished;
    };

    const leave = (after: number) => {
      leaving = window.setTimeout(() => {
        // The app can be used while the intro's logo makes way for the real one.
        root.current?.classList.add(styles.leaving);
        leaving = window.setTimeout(() => done.current(), HANDOVER_MS);
      }, after);
    };

    const step = (time: number) => {
      if (last !== null) frame = Math.min(INTRO_END_FRAME, frame + (Math.min(LONGEST_STEP_MS, time - last) * INTRO_FPS) / 1000);
      last = time;
      if (!paint()) {
        request = window.requestAnimationFrame(step);
        return;
      }
      if (field.current) field.current.style.visibility = "hidden";
      leave(0);
    };

    if (still) {
      paint();
      leave(STILL_MS);
    } else {
      request = window.requestAnimationFrame(step);
    }
    return () => {
      window.cancelAnimationFrame(request);
      window.clearTimeout(leaving);
    };
  }, []);

  return (
    <div ref={root} className={styles.intro} role="status" aria-label="Opening Studenv">
      <div ref={field} className={styles.field} />
      <div ref={text} className={styles.text} aria-hidden="true">
        <div ref={roll} className={styles.roll}>
          {INTRO_WORDS.map((word, i) => (
            <div key={word} ref={i === 0 ? firstWord : undefined}>
              {word}
            </div>
          ))}
        </div>
        <span className={`${styles.label} ${styles.motto}`}>Learning leaves traces.</span>
        <span ref={counter} className={`${styles.label} ${styles.counter}`}>000</span>
        <div ref={bar} className={styles.bar} />
      </div>
      {/* The loaders' mark, drawing and turning as it does there. The yellow screen is its disc. */}
      <div ref={mark} className={styles.mark}>
        <svg viewBox="20 20 242 242" width="100" height="100" aria-hidden="true">
          <g className={loader.spin}>
            {ARROWS.map((d) => (
              <path key={d} className={loader.arrow} d={d} pathLength={1} />
            ))}
            {HEADS.map((d) => (
              <path key={d} className={loader.head} d={d} />
            ))}
          </g>
          <circle className={loader.dot} cx="141" cy="141" r="17" />
        </svg>
      </div>
      <div className={styles.grain} aria-hidden="true" />
    </div>
  );
}
