"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { INTRO_HOLD_FRAME, INTRO_MAX_HOLD_MS, INTRO_STILL_FRAME, INTRO_WORDS, introFrame, logoDisc, nextFrame } from "@/lib/client/intro";
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

/** Stays set until the page is reloaded, so moving between the app's sections doesn't replay it. */
let played = false;

/** It is part of the first paint, and gone for good once played. */
function useOncePerLoad() {
  const [active, setActive] = useState(() => !(typeof window !== "undefined" && played));
  return { active, finish: () => setActive(false) };
}

/** Plays each time the signed-in app is opened or reloaded, while its data loads. */
export function AppIntro() {
  const { active, finish } = useOncePerLoad();
  return active ? <SignedInIntro onDone={finish} /> : null;
}

/** The same on the public home page, where there is no data to wait for. */
export function PublicIntro() {
  const { active, finish } = useOncePerLoad();
  return active ? <Intro ready onDone={finish} /> : null;
}

function SignedInIntro({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const ready = useIntroPreload();

  useEffect(() => {
    for (const screen of MAIN_SCREENS) router.prefetch(screen);
  }, [router]);

  return <Intro ready={ready} onDone={onDone} />;
}

/** The app's sidebar and phone top bar, and the public home page's header. */
const LOGOS = ".shell-brand .brand-mark, .approved-homepage .topbar .brand-logo";

/** Whichever of those logos is on screen. */
function visibleLogo(): DOMRect | null {
  for (const mark of Array.from(document.querySelectorAll(LOGOS))) {
    const box = mark.getBoundingClientRect();
    const brand = mark.closest(".shell-brand, .brand")?.getBoundingClientRect();
    // A collapsed sidebar squeezes the brand to nothing but leaves the image its size.
    if (box.width > 0 && brand && brand.width >= box.width) return box;
  }
  return null;
}

function Intro({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const dataReady = useRef(ready);
  dataReady.current = ready;
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const roll = useRef<HTMLDivElement>(null);
  const firstWord = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    played = true;
  }, []);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = still ? INTRO_STILL_FRAME : 0;
    let last: number | null = null;
    let request = 0;
    let leaving = 0;
    /** When it began waiting on its last word. */
    let heldSince: number | null = null;
    const startedAt = performance.now();

    const paint = () => {
      const box = visibleLogo();
      const now = introFrame(frame, window.innerWidth, window.innerHeight, box ? logoDisc(box) : null);
      const { x, y, size } = now.logo;
      if (mark.current) mark.current.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px) scale(${size / 100})`;
      if (field.current) field.current.style.clipPath = `circle(${now.fieldRadius}px at ${x}px ${y}px)`;
      if (text.current) text.current.style.opacity = String(now.textOpacity);
      if (roll.current) roll.current.style.top = `${now.wordsTop}px`;
      if (firstWord.current) firstWord.current.style.marginTop = `${-now.wordShift * WORD_LINE}em`;
      dot.current?.setAttribute("r", now.dotRadius.toFixed(2));
      if (now.armsStarted) mark.current?.classList.add(styles.drawing);
      // The count doesn't claim to be finished while the data is still on its way.
      const progress = dataReady.current || frame > INTRO_HOLD_FRAME ? now.progress : Math.min(0.99, now.progress);
      if (counter.current) counter.current.textContent = String(Math.round(progress * 100)).padStart(3, "0");
      if (bar.current) bar.current.style.width = `${progress * 100}%`;
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

    const waitedEnough = (time: number) => heldSince !== null && time - heldSince >= INTRO_MAX_HOLD_MS;

    const step = (time: number) => {
      if (frame >= INTRO_HOLD_FRAME) heldSince ??= time;
      const mayLeave = dataReady.current || waitedEnough(time);
      if (last !== null) frame = nextFrame(frame, Math.min(LONGEST_STEP_MS, time - last), mayLeave);
      last = time;
      if (!paint()) {
        request = window.requestAnimationFrame(step);
        return;
      }
      if (field.current) field.current.style.visibility = "hidden";
      leave(0);
    };

    // With reduced motion the finished picture is held still until the data is in.
    const holdStill = () => {
      paint();
      const waited = performance.now() - startedAt;
      if (waited >= STILL_MS && (dataReady.current || waited >= INTRO_MAX_HOLD_MS)) leave(0);
      else leaving = window.setTimeout(holdStill, 100);
    };

    if (still) holdStill();
    else request = window.requestAnimationFrame(step);
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
          <circle ref={dot} className={loader.dot} cx="141" cy="141" r="121" />
        </svg>
      </div>
      <div className={styles.grain} aria-hidden="true" />
    </div>
  );
}
