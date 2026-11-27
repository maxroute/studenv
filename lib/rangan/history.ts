// ---------------------------------------------------------------------------
// The conversation as Rangan is told it: words, and what it made
// ---------------------------------------------------------------------------
//
// Pure. Chat answers are sent as they were. Pages, boards, edits, tasks and
// plans are cards, not text, so each is told as one line ("I wrote a page
// 'JWT basics'…"). Without that, "add the FS module to it" or "make a board
// on what you just wrote" has nothing to refer to.

import type { RanganTurn } from "@/hooks/use-rangan-store";

export type HistoryTurn = { role: "user" | "assistant"; content: string };

const list = (items: readonly string[], max = 8) => {
  const shown = items.map((item) => item.trim()).filter(Boolean).slice(0, max);
  return shown.length ? `${shown.join("; ")}${items.length > max ? "; …" : ""}` : "";
};

/** One turn as text, or null for turns that aren't part of the conversation (errors). */
export function historyText(turn: RanganTurn): HistoryTurn | null {
  switch (turn.role) {
    case "user":
      return { role: "user", content: turn.quote ? `About this selected text: "${turn.quote}"\n${turn.content}` : turn.content };
    case "assistant":
      return { role: "assistant", content: turn.content };
    case "page": {
      const sections = list(turn.draft.outline);
      const state = turn.noteId ? "The student created it." : "Not created yet.";
      return { role: "assistant", content: `I wrote a new page, "${turn.draft.title}". ${state}${sections ? ` Its sections: ${sections}.` : ""}` };
    }
    case "map": {
      const branches = list(turn.map.outline.filter((line) => !line.startsWith(" ")));
      const state = turn.boardId ? "The student created the board." : "Not created yet.";
      return { role: "assistant", content: `I drafted a board (mind map), "${turn.map.draft.title}". ${state}${branches ? ` Branches: ${branches}.` : ""}` };
    }
    case "edit":
      return { role: "assistant", content: `I suggested a change to the open page: ${turn.edit.summary} ${turn.applied ? "The student applied it." : "Not applied yet."}` };
    case "board-edit":
      return { role: "assistant", content: `I suggested a change to the open board: ${turn.edit.summary} ${turn.applied ? "The student applied it." : "Not applied yet."}` };
    case "task":
      return { role: "assistant", content: `I drafted planner tasks: ${list(turn.tasks.map((task) => `${task.title} (${task.day}${task.time ? ` ${task.time}` : ""})`))}. ${turn.saved ? "The student added them." : "Not added yet."}` };
    case "plan":
      return { role: "assistant", content: `I made a study plan: ${turn.plan.goal}. ${turn.saved ? "The student added it to the planner." : "Not added yet."}` };
    case "explore":
      return { role: "assistant", content: `I suggested what to explore next: ${list(turn.explore.gaps.map((gap) => gap.concept))}.` };
    default:
      return null;
  }
}

/** The last `turns` turns, each cut to `chars` characters, oldest first. */
export function conversationHistory(all: readonly RanganTurn[], turns: number, chars: number): HistoryTurn[] {
  return all
    .map(historyText)
    .filter((turn): turn is HistoryTurn => turn !== null && turn.content.trim().length > 0)
    .slice(-turns)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, chars) }));
}
