// ---------------------------------------------------------------------------
// What Rangan says it is doing while a request is in flight
// ---------------------------------------------------------------------------
//
// Pure. The server answers in one go, so these are the steps a request of
// that kind goes through, shown in turn: true to the work, never a made-up
// count or a promise about the result.

export type ProgressRequest =
  | { kind: "ask"; question: string; focus?: unknown }
  | { kind: "summarize" }
  | { kind: "plan" }
  | { kind: "explore" };

export type ProgressContext = { pageOpen: boolean; boardOpen: boolean };

/** Seconds before each step after the first is shown. */
const STEP_SECONDS = [0, 3, 8];

const PAGE = /\b(create|make|write|generate|build|prepare)\b[^.?!]{0,40}\b(notes?|page|cheat ?sheet|revision sheet|summary page)\b/i;
const BOARD = /\b(board|white ?board|mind ?map|diagram|flow ?chart|road ?map|visuali[sz]ation)\b/i;
const TASK = /\b(remind me|reminder|planner|to-?do|task|deadline)\b/i;
const EDIT = /\b(add|change|edit|fix|rewrite|shorten|simplify|bold|highlight|colou?r|link|move|arrange|connect|delete|remove|rename|turn)\b/i;

function steps(request: ProgressRequest, where: ProgressContext): string[] {
  switch (request.kind) {
    case "summarize":
      return ["Reading it", "Picking out the key points", "Writing the summary"];
    case "plan":
      return ["Reading your material", "Spreading it over your days", "Writing the plan"];
    case "explore":
      return ["Reading your page", "Looking through your library", "Finding what to explore next"];
    case "ask": {
      const question = request.question;
      if (request.focus) return ["Reading your selection", "Looking at the page around it", "Writing the explanation"];
      if (TASK.test(question)) return ["Reading your request", "Drafting your tasks"];
      if (where.boardOpen && EDIT.test(question)) return ["Reading this board", "Planning the changes"];
      if (where.pageOpen && EDIT.test(question) && !PAGE.test(question)) return ["Reading this page", "Planning the changes"];
      if (BOARD.test(question)) return ["Understanding your request", "Gathering material", "Planning the board"];
      if (PAGE.test(question)) return ["Understanding your request", "Gathering material", "Writing your page"];
      return ["Thinking", "Looking through your notes", "Writing the answer"];
    }
  }
}

/** The step to show after `seconds` of waiting, with an ellipsis. */
export function progressLabel(request: ProgressRequest, where: ProgressContext, seconds: number): string {
  const list = steps(request, where);
  let index = 0;
  for (let i = 0; i < list.length; i++) if (seconds >= STEP_SECONDS[i]) index = i;
  return `${list[index]}…`;
}
