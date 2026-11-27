"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { useFocusHistory } from "@/hooks/use-focus-history";
import { describeDay, focusLabel, studyDay, type CalendarTask, type StudyDay } from "@/lib/client/study-calendar";
import styles from "./study-calendar.module.css";

type CalendarProps = {
  tasks: CalendarTask[];
  selectedDate: Date | null;
  /** Picking the picked day again clears it. */
  onSelect: (day: Date | null) => void;
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

async function overviewFetcher(url: string): Promise<{ stats: { streak: number } }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Not available");
  return response.json();
}

const longDay = (day: Date) => day.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });

function Day({ day, info, selected, today, weekday, onSelect }: { day: Date; info: StudyDay; selected: boolean; today: boolean; weekday?: boolean; onSelect: CalendarProps["onSelect"] }) {
  const state = [styles.day, styles[`level${info.level}`], info.allDone && styles.done, today && styles.today, selected && styles.selected].filter(Boolean).join(" ");
  const description = `${longDay(day)}: ${describeDay(info)}${info.allDone ? ", all done" : ""}${info.upcoming ? ", tasks coming up" : ""}${info.unfinished ? ", unfinished" : ""}`;
  return (
    <button type="button" className={state} aria-pressed={selected} aria-current={today ? "date" : undefined} aria-label={description} title={description} onClick={() => onSelect(selected ? null : day)}>
      {weekday ? <small aria-hidden="true">{WEEKDAYS[day.getDay()]}</small> : null}
      <span aria-hidden="true">{day.getDate()}</span>
      {info.upcoming || info.unfinished ? <i className={`${styles.dot}${info.unfinished ? ` ${styles.missed}` : ""}`} aria-hidden="true" /> : null}
    </button>
  );
}

/** The month as a study record: focus time fills each day, with ticks, what is coming and what was left. */
export function StudyCalendar({ tasks, selectedDate, onSelect }: CalendarProps) {
  const now = new Date();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  // A day picked elsewhere (the week strip) brings its month into view.
  useEffect(() => {
    if (selectedDate) setMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [selectedDate]);

  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const history = useFocusHistory(month, next);
  const overview = useSWR("/api/dashboard", overviewFetcher);
  const length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from({ length }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1));
  const monthName = month.toLocaleDateString("en-US", { month: "long" });
  const monthMs = days.reduce((total, day) => total + studyDay(day, [], history.days, now).focusMs, 0);

  const shown = selectedDate && selectedDate.getMonth() === month.getMonth() ? selectedDate : now.getMonth() === month.getMonth() && now.getFullYear() === month.getFullYear() ? now : null;
  const streak = overview.data?.stats.streak;

  return (
    <section className={styles.calendar} aria-label="Study calendar">
      <div className={styles.head}>
        <h2>
          {monthName} {month.getFullYear()}
        </h2>
        <div>
          <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => setMonth(next)}>
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.grid}>
        {WEEKDAYS.map((name, index) => (
          <span key={`${name}-${index}`} className={styles.weekday} aria-hidden="true">{name}</span>
        ))}
        {Array.from({ length: month.getDay() }, (_, index) => (
          <span key={`blank-${index}`} />
        ))}
        {days.map((day) => (
          <Day
            key={day.getDate()}
            day={day}
            info={studyDay(day, tasks, history.days, now)}
            selected={selectedDate?.toDateString() === day.toDateString()}
            today={now.toDateString() === day.toDateString()}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className={styles.legend} aria-hidden="true">
        <span><i className={styles.keyFocus} /> Focus time</span>
        <span><i className={styles.keyDone} /> All done</span>
        <span><i className={styles.keyDot} /> Coming up</span>
        <span><i className={styles.keyLeft} /> Unfinished</span>
      </div>

      {shown ? (
        <p className={styles.detail} aria-live="polite">
          <strong>{longDay(shown)}</strong>
          {history.error ? "Focus time could not be loaded" : history.loading ? "Loading focus time…" : describeDay(studyDay(shown, tasks, history.days, now))}
        </p>
      ) : null}

      <div className={styles.totals}>
        {streak !== undefined ? (
          <span>
            <Flame size={13} aria-hidden="true" /> {streak}-day streak
          </span>
        ) : null}
        <span>{history.loading || history.error ? "–" : focusLabel(monthMs)} in {monthName}</span>
      </div>
    </section>
  );
}

/** The week of today, or of the picked day; the month takes its place when asked for. */
export function StudyWeek({ tasks, selectedDate, onSelect }: CalendarProps) {
  const now = new Date();
  const anchor = selectedDate ?? now;
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay());
  const days = Array.from({ length: 7 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + index));
  const history = useFocusHistory(first, new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7));

  return (
    <section className={styles.week} aria-label="This week">
      {days.map((day) => (
        <Day
          key={day.toDateString()}
          day={day}
          weekday
          info={studyDay(day, tasks, history.days, now)}
          selected={selectedDate?.toDateString() === day.toDateString()}
          today={now.toDateString() === day.toDateString()}
          onSelect={onSelect}
        />
      ))}
    </section>
  );
}
