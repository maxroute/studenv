// ---------------------------------------------------------------------------
// Workspace undo/redo history (stage 6, decision D-1)
// ---------------------------------------------------------------------------
// Snapshot history of the workspace item list. Item objects are immutable in
// the store, so snapshots share unchanged items by reference. Changes made
// between two capture breaks (one pointer press → release, one key action)
// form a single undo step, like Yjs' UndoManager capture groups in AFFiNE.
// ---------------------------------------------------------------------------

import type { StudioItem } from "@/types/workspace";

export const WORKSPACE_HISTORY_LIMIT = 100;

/** Same scene content: unchanged items are shared, changed ones are compared by value. */
export function sameItems(a: readonly StudioItem[], b: readonly StudioItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index] || JSON.stringify(item) === JSON.stringify(b[index]));
}

export class WorkspaceHistory {
  private past: StudioItem[][] = [];
  private future: StudioItem[][] = [];
  private capturing = false;

  constructor(private readonly limit = WORKSPACE_HISTORY_LIMIT) {}

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  /** A user change replaced `previous`; the first change of a capture group opens a step. */
  record(previous: StudioItem[]) {
    if (this.capturing) return;
    this.past.push(previous);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    this.capturing = true;
  }

  /** Close the current step; a step that changed nothing (e.g. a cancelled drag) is dropped. */
  breakCapture(current: readonly StudioItem[]) {
    if (this.capturing && this.past.length > 0 && sameItems(this.past[this.past.length - 1], current)) {
      this.past.pop();
    }
    this.capturing = false;
  }

  undo(current: StudioItem[]): StudioItem[] | null {
    this.breakCapture(current);
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(current);
    return previous;
  }

  redo(current: StudioItem[]): StudioItem[] | null {
    this.breakCapture(current);
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current);
    return next;
  }

  /** Loading another workspace (or reloading) starts a fresh history. */
  reset() {
    this.past = [];
    this.future = [];
    this.capturing = false;
  }
}
