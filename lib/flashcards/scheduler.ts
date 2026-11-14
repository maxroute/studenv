// ---------------------------------------------------------------------------
// Flashcard scheduling: FSRS (v4 formulas, default weights) with short
// learning steps. Pure: (state, rating, now) -> next state.
// ---------------------------------------------------------------------------
//
// Ratings: 1 Again, 2 Hard, 3 Good, 4 Easy. Stability S is the interval in
// days at which recall probability falls to 90%; difficulty D is 1..10.

export type Rating = 1 | 2 | 3 | 4;
export type ReviewStateName = "new" | "learning" | "review" | "relearning";

export type ReviewState = {
  state: ReviewStateName;
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
  due: Date;
  lastReviewedAt: Date | null;
};

/** FSRS default weights. */
const W = [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61] as const;

export const DESIRED_RETENTION = 0.9;
const MAX_INTERVAL_DAYS = 36500;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function newReviewState(now: Date): ReviewState {
  return { state: "new", stability: null, difficulty: null, reps: 0, lapses: 0, due: now, lastReviewedAt: null };
}

function initialStability(rating: Rating) {
  return Math.max(W[rating - 1], 0.1);
}

function initialDifficulty(rating: Rating) {
  return clamp(W[4] - (rating - 3) * W[5], 1, 10);
}

function nextDifficulty(difficulty: number, rating: Rating) {
  const moved = difficulty - W[6] * (rating - 3);
  // Mean reversion toward the default difficulty keeps D from drifting to an end.
  return clamp(W[7] * W[4] + (1 - W[7]) * moved, 1, 10);
}

/** Probability of recall after `elapsedDays` with stability `stability`. */
export function retrievability(elapsedDays: number, stability: number) {
  return Math.pow(1 + elapsedDays / (9 * stability), -1);
}

function recallStability(difficulty: number, stability: number, r: number, rating: Rating) {
  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus = rating === 4 ? W[16] : 1;
  return stability * (Math.exp(W[8]) * (11 - difficulty) * Math.pow(stability, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hardPenalty * easyBonus + 1);
}

function forgetStability(difficulty: number, stability: number, r: number) {
  return W[11] * Math.pow(difficulty, -W[12]) * (Math.pow(stability + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]);
}

/** Days until recall probability drops to the desired retention. */
export function intervalDays(stability: number, retention = DESIRED_RETENTION) {
  return clamp(Math.round(9 * stability * (1 / retention - 1)), 1, MAX_INTERVAL_DAYS);
}

const after = (now: Date, ms: number) => new Date(now.getTime() + ms);

/** The state after answering `rating` at `now`. */
export function schedule(current: ReviewState, rating: Rating, now: Date): ReviewState {
  const reps = current.reps + 1;
  const base = { reps, lastReviewedAt: now };

  if (current.state === "new" || current.stability === null || current.difficulty === null) {
    const stability = initialStability(rating);
    const difficulty = initialDifficulty(rating);
    if (rating === 1) return { ...current, ...base, state: "learning", stability, difficulty, due: after(now, 1 * MINUTE) };
    if (rating === 2) return { ...current, ...base, state: "learning", stability, difficulty, due: after(now, 6 * MINUTE) };
    return { ...current, ...base, state: "review", stability, difficulty, due: after(now, intervalDays(stability) * DAY) };
  }

  const difficulty = nextDifficulty(current.difficulty, rating);

  if (current.state === "learning" || current.state === "relearning") {
    if (rating === 1) return { ...current, ...base, difficulty, due: after(now, 5 * MINUTE) };
    if (rating === 2) return { ...current, ...base, difficulty, due: after(now, 10 * MINUTE) };
    const stability = rating === 4 ? current.stability * W[16] : current.stability;
    return { ...current, ...base, state: "review", stability, difficulty, due: after(now, intervalDays(stability) * DAY) };
  }

  // Review: recall probability depends on how long it has been.
  const elapsedDays = current.lastReviewedAt ? Math.max(0, (now.getTime() - current.lastReviewedAt.getTime()) / DAY) : 0;
  const r = retrievability(elapsedDays, current.stability);
  if (rating === 1) {
    const stability = Math.min(forgetStability(difficulty, current.stability, r), current.stability);
    return { ...current, ...base, state: "relearning", stability, difficulty, lapses: current.lapses + 1, due: after(now, 10 * MINUTE) };
  }
  const stability = recallStability(difficulty, current.stability, r, rating);
  return { ...current, ...base, state: "review", stability, difficulty, due: after(now, intervalDays(stability) * DAY) };
}
