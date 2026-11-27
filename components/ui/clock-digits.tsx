import styles from "./clock-digits.module.css";

/**
 * A running time that keeps its width. The app fonts draw each digit at a
 * different width (and have no tabular figures), so each digit gets its own slot.
 */
export function ClockDigits({ value }: { value: string }) {
  return (
    <span className={styles.clock}>
      <span className={styles.readable}>{value}</span>
      <span aria-hidden="true">
        {Array.from(value, (character, index) => (
          <span key={index} className={/\d/.test(character) ? styles.digit : undefined}>
            {character}
          </span>
        ))}
      </span>
    </span>
  );
}
