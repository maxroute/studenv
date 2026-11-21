// ---------------------------------------------------------------------------
// Is a chat message asking Rangan for a study plan?
// ---------------------------------------------------------------------------
//
// Pure. Kept narrow on purpose: a plan uses a daily question like any answer,
// but a wrong guess would show a plan to someone who asked a question. So a
// message counts only when it names a plan or schedule outright ("study
// plan", "revision timetable") or opens by asking for one ("plan my…",
// "make me a schedule…", "can you help me plan…").

const NAMED = /\b(study|revision|exam|test|learning|reading)\s+(plan|schedule|timetable)s?\b/i;
const OPENING =
  /^\s*(please\s+)?((can|could|would|will)\s+you\s+)?(please\s+)?(help\s+me\s+)?(plan|schedule|make|create|build|draw\s+up|give)\b/i;
const PLAN_WORD = /\b(plan|schedule|timetable)\b/i;
/** A plan *for* something, not a question about plans: "plan my week", "plan for the exam". */
const OPENS_WITH_PLAN = /^\s*(please\s+)?((can|could|would|will)\s+you\s+)?(please\s+)?(help\s+me\s+)?(plan|schedule)\s+(my|out|for|a|the|me|our|revision|studying|study)\b/i;

/** Studying toward a deadline: "I want to plan this for my exam on Friday", "help me study this before my test". */
const TOWARD_DEADLINE =
  /\b(plan|schedule|prepare|study|revise|cover|finish)\b.{0,80}\b(for|before|by)\s+(my\s+|the\s+|our\s+|next\s+)?(exams?|tests?|quiz(zes)?|finals?|mid-?terms?|boards?|interviews?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|tomorrow|the weekend)\b/i;
/** A question about something, not a request to plan it. */
const ASKS_A_QUESTION = /^\s*(what|why|how|when|which|who|whom|where|is|are|was|were|does|do|did|should|can i|could i)\b/i;

export function isPlanRequest(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 500) return false;
  if (NAMED.test(text)) return true;
  if (OPENS_WITH_PLAN.test(text)) return true;
  if (TOWARD_DEADLINE.test(text) && !ASKS_A_QUESTION.test(text) && !/\b(flashcards?|quiz me|page|board|map)\b/i.test(text)) return true;
  // "make me a plan…", "create a schedule…", "can you give me a timetable…"
  return OPENING.test(text) && !/^\s*(plan|schedule)\b/i.test(text) && PLAN_WORD.test(text);
}

/** True when a request is about what is open in front of the student: "this", "this page", "these notes". */
export function refersToOpen(message: string): boolean {
  // "this week" or "these days" are times, not what is open.
  const TIME = "(week|weekend|month|semester|term|year|morning|afternoon|evening|night|time|days?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
  return new RegExp(`\\b(this|these)\\b(?!\\s+${TIME}\\b)|\\b(it|here)\\b|\\bthe (open |current )?(page|note|notes|chapter)\\b`, "i").test(message);
}
