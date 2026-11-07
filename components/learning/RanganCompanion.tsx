"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpenText, Brain, Check, ClipboardList, LoaderCircle, Save, Sparkles } from "lucide-react";

type RanganAction = "research" | "explain" | "notes" | "flashcards";
type Flashcard = { front: string; back: string };
type Result = { action: RanganAction; title: string; content: string; flashcards?: Flashcard[] };

async function readApiResponse<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok || !result?.ok) throw new Error(result?.error || "The action could not be completed.");
  return result.data as T;
}

export function RanganCompanion({
  courseNodeId,
  courseId,
  courseTitle,
  nodeTitle,
  compact = false,
}: {
  courseNodeId?: string | null;
  courseId?: string | null;
  courseTitle?: string;
  nodeTitle?: string;
  compact?: boolean;
}) {
  const [action, setAction] = useState<RanganAction>("explain");
  const [prompt, setPrompt] = useState(nodeTitle ? `Explain ${nodeTitle}` : "");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [savedItemId, setSavedItemId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setResult(null);
    setSavedItemId(null);
    setTaskId(null);
    try {
      const data = await readApiResponse<Result>(await fetch("/api/rangan/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, prompt, courseId: courseId ?? null, courseNodeId: courseNodeId ?? null }),
      }));
      setResult(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Rangan could not complete that action.");
    } finally {
      setBusy(false);
    }
  }

  async function saveToShelf() {
    if (!result) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await readApiResponse<{ saved: boolean; item: { id: string } }>(await fetch("/api/rangan/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_to_shelf", title: result.title, content: result.content, materialKind: result.action === "research" ? "explanation" : result.action, courseNodeId: courseNodeId ?? null }),
      }));
      if (!response.saved || !response.item?.id) throw new Error("Shelf did not confirm the save.");
      setSavedItemId(response.item.id);
      setNotice("Saved to Shelf.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save this material to Shelf.");
    } finally {
      setSaving(false);
    }
  }

  async function createRevisionTask() {
    if (!result) return;
    setCreatingTask(true);
    setError("");
    setNotice("");
    try {
      const response = await readApiResponse<{ created: boolean; task: { id: string } }>(await fetch("/api/rangan/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_revision_task", title: `Revise ${prompt.trim() || result.title}`, courseNodeId: courseNodeId ?? null }),
      }));
      if (!response.created || !response.task?.id) throw new Error("Planner did not confirm the task.");
      setTaskId(response.task.id);
      setNotice("Revision task added to Planner.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not add the revision task.");
    } finally {
      setCreatingTask(false);
    }
  }

  return (
    <section className={`flex min-h-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] ${compact ? "h-full" : "mx-auto w-full max-w-5xl"}`}>
      <header className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--amber)]"><Sparkles className="h-4 w-4" /> Learning companion</div>
        <h1 className={`mt-2 font-display tracking-[-0.025em] text-[var(--text)] ${compact ? "text-xl" : "text-3xl"}`}>Rangan</h1>
        <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">Research and shape learning material using your selected Studenv context.</p>
        {courseTitle || nodeTitle ? <div className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-2.5 py-1.5 text-[10px] text-[var(--muted)]"><BookOpenText className="h-3 w-3 shrink-0 text-[var(--amber)]" /><span className="truncate">{[courseTitle, nodeTitle].filter(Boolean).join(" · ")}</span></div> : <div className="mt-3 text-[10px] text-[var(--muted2)]">No course context selected</div>}
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        <form onSubmit={generate} className="space-y-3">
          <label className="field"><span>What are you learning?</span><textarea required maxLength={4000} rows={compact ? 3 : 4} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="e.g. Research rotational motion and explain torque with an example" /></label>
          <div className="grid grid-cols-2 gap-2">
            {([
              ["research", "Research concept", Brain],
              ["explain", "Explain topic", Sparkles],
              ["notes", "Create notes", BookOpenText],
              ["flashcards", "Flashcards", ClipboardList],
            ] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" aria-pressed={action === value} onClick={() => setAction(value)} className={`flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-left text-[10px] transition ${action === value ? "border-[var(--amber-dim)] bg-[var(--amber-glow)] text-[var(--amber)]" : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"}`}><Icon className="h-3.5 w-3.5 shrink-0" />{label}</button>
            ))}
          </div>
          <button disabled={busy || !prompt.trim()} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--amber)] text-xs font-semibold text-[#17130c] disabled:cursor-not-allowed disabled:opacity-50">{busy ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Working with Gemini…</> : <><Sparkles className="h-4 w-4" /> Ask Rangan</>}</button>
        </form>

        {error ? <p role="alert" className="rounded-md border border-[rgba(224,90,75,.25)] bg-[rgba(224,90,75,.07)] px-3 py-2 text-xs leading-5 text-[var(--red)]">{error}</p> : null}
        {result ? <article className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3"><div><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted2)]">Gemini response</div><h2 className="mt-1 font-display text-lg text-[var(--text)]">{result.title}</h2></div><span className="rounded border border-[var(--border)] px-2 py-1 font-mono text-[9px] uppercase text-[var(--muted)]">{result.action}</span></div>
          <div className="whitespace-pre-wrap text-[12px] leading-6 text-[var(--text)]">{result.content}</div>
          {result.flashcards?.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{result.flashcards.map((card, index) => <div key={`${index}-${card.front}`} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"><div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--amber)]">Q · {card.front}</div><p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">{card.back}</p></div>)}</div> : null}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
            <button disabled={saving || !!savedItemId} onClick={() => void saveToShelf()} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-[10px] text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--text)] disabled:opacity-50">{savedItemId ? <Check className="h-3.5 w-3.5 text-[var(--green)]" /> : saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{savedItemId ? "Saved to Shelf" : saving ? "Saving…" : "Save to Shelf"}</button>
            <button disabled={creatingTask || !!taskId} onClick={() => void createRevisionTask()} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-[10px] text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--text)] disabled:opacity-50">{taskId ? <Check className="h-3.5 w-3.5 text-[var(--green)]" /> : creatingTask ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}{taskId ? "Added to Planner" : creatingTask ? "Adding…" : "Add revision task"}</button>
            {savedItemId ? <Link href={`/shelf/${savedItemId}`} className="inline-flex h-8 items-center gap-1 text-[10px] text-[var(--amber)] hover:brightness-125">View in Shelf <ArrowUpRight className="h-3 w-3" /></Link> : null}
            {taskId ? <Link href="/dashboard/planner" className="inline-flex h-8 items-center gap-1 text-[10px] text-[var(--amber)] hover:brightness-125">View Planner <ArrowUpRight className="h-3 w-3" /></Link> : null}
          </div>
          {notice ? <p role="status" className="mt-3 text-[10px] text-[var(--green)]">{notice}</p> : null}
        </article> : <div className="flex gap-3 rounded-md border border-dashed border-[var(--border2)] p-3 text-[10px] leading-5 text-[var(--muted)]"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--amber)]" /><p>Rangan uses the current course path and linked Shelf material when selected. Context is sent to Gemini only for the requested action.</p></div>}
      </div>
    </section>
  );
}
