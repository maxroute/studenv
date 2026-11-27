import styles from "./page-loader.module.css";

type PageLoaderProps = {
  /** What is opening, for example "Opening your library". */
  label?: string;
  /** Fill the whole window, for loads before the app frame exists. */
  full?: boolean;
};

/** The two arms of the Studenv mark and their heads, on a 282 grid with its centre at 141. */
export const ARROWS = [
  "M111.5 142.5C84.4 133.7 76 98.2 94.4 74.6C107.6 57.6 128.6 51.6 151 54",
  "M170.5 139.5C197.6 148.3 206 183.8 187.6 207.4C174.4 224.4 153.4 230.4 131 228",
];
export const HEADS = ["M146.5 40.5L164.5 55.2L149.2 72.1", "M135.5 241.5L117.5 226.8L132.8 209.9"];

/**
 * The loading screen of every page: faint outlines of the content with the
 * Studenv mark drawing itself in the middle. It waits a moment before showing,
 * so a page that arrives quickly never flashes it.
 */
export function PageLoader({ label = "Opening Studenv", full = false }: PageLoaderProps) {
  return (
    <div className={`${styles.loader}${full ? ` ${styles.full}` : ""}`} role="status" aria-live="polite">
      <div className={styles.outlines} aria-hidden="true">
        <span className={styles.title} />
        <div>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <span key={index} />
          ))}
        </div>
      </div>
      <div className={styles.center}>
        <svg className={styles.mark} viewBox="0 0 282 282" width="76" height="76" aria-hidden="true">
          <circle className={styles.disc} cx="141" cy="141" r="121" />
          <g className={styles.spin}>
            {ARROWS.map((d) => (
              <path key={d} className={styles.arrow} d={d} pathLength={1} />
            ))}
            {HEADS.map((d) => (
              <path key={d} className={styles.head} d={d} />
            ))}
          </g>
          <circle className={styles.dot} cx="141" cy="141" r="17" />
        </svg>
        <span className={styles.label}>{label}…</span>
      </div>
    </div>
  );
}
