"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BookOpen, Check, Clock3, FileText, LoaderCircle, Pause, Play, Plus, Sparkles, Square, TimerReset, X } from "lucide-react";
import { RanganCompanion } from "@/components/learning/RanganCompanion";
import { useFocusStore } from "@/hooks/useFocusStore";

interface StudyNode {
  id: string;
  title: string;
  type: "subject" | "topic" | "lecture";
  originalUrl: string | null;
  items: Array<{ id: string; type: string; title: string; url: string | null; excerpt: string | null; notes: string | null; createdAt: string }>;
  course: { id: string; title: string; providerName: string; courseUrl: string };
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok || !result?.ok) throw new Error(result?.error || "Could not complete that request.");
  return result.data as T;
}

function displayTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function FocusStudio({ node }: { node: StudyNode }) {
  const [activeTab, setActiveTab] = useState<"notes" | "resources">("notes");
  const [notes, setNotes] = useState(() => node.items.find((item) => item.title === `Lecture notes — ${node.title}`)?.notes ?? "");
  const [resources, setResources] = useState(() => node.items.filter((item) => item.type !== "note"));
  const [notesState, setNotesState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [resourceForm, setResourceForm] = useState(false);
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceBusy, setResourceBusy] = useState(false);
  const [resourceError, setResourceError] = useState("");
  const [ranganOpen, setRanganOpen] = useState(false);

  const hydrated = useFocusStore((state) => state._hydrated);
  const activeSession = useFocusStore((state) => state.activeSession);
  const displayTimeLeft = useFocusStore((state) => state.displayTimeLeft);
  const selectedType = useFocusStore((state) => state.selectedType);
  const goal = useFocusStore((state) => state.goal);
  const setGoal = useFocusStore((state) => state.setGoal);
  const setCourseNodeId = useFocusStore((state) => state.setCourseNodeId);
  const setSelectedType = useFocusStore((state) => state.setSelectedType);
  const startTimer = useFocusStore((state) => state.startTimer);
  const pauseTimer = useFocusStore((state) => state.pauseTimer);
  const resumeTimer = useFocusStore((state) => state.resumeTimer);
  const finishTimer = useFocusStore((state) => state.finishTimer);

  useEffect(() => {
    if (!hydrated || activeSession) return;
    setCourseNodeId(node.id);
    setGoal(node.title);
    if (selectedType !== "focus") setSelectedType("focus");
  }, [hydrated, activeSession, node.id, node.title, selectedType, setCourseNodeId, setGoal, setSelectedType]);

  const providerUrl = node.originalUrl || node.course.courseUrl;
  const paused = !!activeSession && activeSession.pausedAt !== null;
  const savedResources = useMemo(() => resources.filter((resource) => resource.type !== "note"), [resources]);

  async function saveNotes() {
    setNotesState("saving");
    try {
      await readApiResponse(await fetch(`/api/learning/nodes/${node.id}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: notes }),
      }));
      setNotesState("saved");
      window.setTimeout(() => setNotesState("idle"), 2400);
    } catch {
      setNotesState("error");
    }
  }

  async function addResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResourceBusy(true);
    setResourceError("");
    try {
      const resource = await readApiResponse<(typeof resources)[number]>(await fetch(`/api/learning/nodes/${node.id}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: resourceTitle, url: resourceUrl }),
      }));
      setResources((current) => [resource, ...current]);
      setResourceTitle("");
      setResourceUrl("");
      setResourceForm(false);
    } catch (error) {
      setResourceError(error instanceof Error ? error.message : "Could not save this resource.");
    } finally {
      setResourceBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/learning/${node.course.id}`} className="mb-2 inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)] hover:text-[var(--text)]"><ArrowLeft className="h-3 w-3" /> {node.course.title}</Link>
          <h1 className="truncate font-display text-2xl tracking-[-0.025em] text-[var(--text)] sm:text-[28px]">{node.title}</h1>
          <p className="mt-1 text-[11px] text-[var(--muted)]">{node.course.providerName} <span className="px-1 text-[var(--muted2)]">/</span> Focus Studio</p>
        </div>
        <button onClick={() => setRanganOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--amber-dim)] bg-[var(--amber-glow)] px-3 text-[11px] font-medium text-[var(--amber)] hover:brightness-110"><Sparkles className="h-3.5 w-3.5" /> Ask Rangan</button>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_350px] 2xl:gap-5">
        <main className="min-w-0 space-y-4">
          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="relative flex aspect-video min-h-[240px] max-h-[min(64vh,740px)] flex-col items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,_rgba(245,166,35,0.09),_transparent_55%),linear-gradient(145deg,#171715,#10100f)] px-5 text-center sm:min-h-[320px]">
              <div className="absolute left-4 top-4 rounded border border-[var(--amber-dim)] bg-[#0e0e0e]/80 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.13em] text-[var(--amber)]">Simulated provider content</div>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--amber-dim)] bg-[var(--amber-glow)] text-[var(--amber)]"><Play className="ml-0.5 h-6 w-6 fill-current" /></div>
              <div className="font-display text-2xl text-[var(--text)] sm:text-3xl">{node.title}</div>
              <p className="mt-2 max-w-md text-[11px] leading-5 text-[var(--muted)]">This preview is simulated. Provider login and playback stay with {node.course.providerName}; embedded playback is not connected.</p>
              <a href={providerUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex h-9 items-center gap-2 rounded-md bg-[var(--amber)] px-3.5 text-[11px] font-semibold text-[#17130c] hover:brightness-105">Open on provider <ArrowUpRight className="h-3.5 w-3.5" /></a>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-3 text-[10px] text-[var(--muted)] sm:px-5">
              <span className="inline-flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5 text-[var(--amber)]" /> {node.course.title} / {node.title}</span>
              <span>Provider watch-time is not tracked</span>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--amber-dim)] bg-[var(--amber-glow)] text-[var(--amber)]"><Clock3 className="h-4 w-4" /></div>
                <div><div className="font-mono text-[9px] uppercase tracking-[0.13em] text-[var(--muted2)]">Focus timer · {activeSession ? activeSession.type === "focus" ? "Focus session" : "Break" : "Ready"}</div><div className="mt-0.5 font-mono text-2xl tabular-nums text-[var(--text)]">{displayTime(displayTimeLeft)}</div></div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!activeSession ? <button onClick={startTimer} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--amber)] px-3 text-[11px] font-semibold text-[#17130c]"><Play className="h-3.5 w-3.5 fill-current" /> Start focus</button> : paused ? <button onClick={resumeTimer} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--amber)] px-3 text-[11px] font-semibold text-[#17130c]"><Play className="h-3.5 w-3.5 fill-current" /> Resume</button> : <button onClick={pauseTimer} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border2)] px-3 text-[11px] text-[var(--text)] hover:bg-[var(--surface2)]"><Pause className="h-3.5 w-3.5" /> Pause</button>}
                {activeSession ? <button onClick={finishTimer} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-[11px] text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"><Square className="h-3 w-3 fill-current" /> End & save</button> : null}
                {!activeSession && displayTimeLeft !== 25 * 60 ? <button onClick={() => useFocusStore.getState().resetTimer()} title="Reset timer" className="rounded-md border border-[var(--border)] p-2 text-[var(--muted)] hover:bg-[var(--surface2)]"><TimerReset className="h-4 w-4" /></button> : null}
              </div>
            </div>
            <label className="mt-4 block max-w-xl"><span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted2)]">Session goal</span><input disabled={!!activeSession} value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={200} placeholder="What will you focus on?" className="!py-2 text-[11px] disabled:opacity-60" /></label>
            <p className="mt-3 text-[10px] leading-5 text-[var(--muted2)]">Completed sessions and sessions you end early are recorded in Studenv. Pauses do not count as focus time.</p>
          </section>
        </main>

        <aside className="min-h-[380px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] xl:sticky xl:top-4">
          <div className="flex border-b border-[var(--border)] px-3">
            <button role="tab" aria-selected={activeTab === "notes"} onClick={() => setActiveTab("notes")} className={`inline-flex h-11 items-center gap-1.5 border-b-2 px-3 text-[11px] ${activeTab === "notes" ? "border-[var(--amber)] text-[var(--text)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"}`}><FileText className="h-3.5 w-3.5" /> Notes</button>
            <button role="tab" aria-selected={activeTab === "resources"} onClick={() => setActiveTab("resources")} className={`inline-flex h-11 items-center gap-1.5 border-b-2 px-3 text-[11px] ${activeTab === "resources" ? "border-[var(--amber)] text-[var(--text)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"}`}><BookOpen className="h-3.5 w-3.5" /> Resources <span className="font-mono text-[9px] text-[var(--muted2)]">{savedResources.length}</span></button>
          </div>
          {activeTab === "notes" ? <div className="p-4">
            <div className="mb-3 flex items-start justify-between gap-2"><div><h2 className="font-display text-lg text-[var(--text)]">Lecture notes</h2><p className="mt-0.5 text-[10px] text-[var(--muted)]">Saved as a note in Shelf and linked to this lecture.</p></div><button onClick={() => void saveNotes()} disabled={notesState === "saving"} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--amber)] px-2.5 text-[10px] font-semibold text-[#17130c] disabled:opacity-50">{notesState === "saving" ? <LoaderCircle className="h-3 w-3 animate-spin" /> : notesState === "saved" ? <Check className="h-3 w-3" /> : <FileText className="h-3 w-3" />}{notesState === "saving" ? "Saving…" : notesState === "saved" ? "Saved" : "Save notes"}</button></div>
            <textarea aria-label="Lecture notes" value={notes} onChange={(event) => { setNotes(event.target.value); setNotesState("idle"); }} maxLength={50000} className="!min-h-[260px] w-full resize-y !rounded-md !bg-[var(--bg)] !p-3 text-[11px] leading-5" placeholder="Write an idea, formula, or question to revisit…" />
            {notesState === "error" ? <p role="alert" className="mt-2 text-[10px] text-[var(--red)]">Notes could not be saved. Your text is still here; try again.</p> : null}
          </div> : <div className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2"><div><h2 className="font-display text-lg text-[var(--text)]">Resources</h2><p className="mt-0.5 text-[10px] text-[var(--muted)]">Saved URLs are Shelf items linked to this lecture.</p></div><button onClick={() => setResourceForm((value) => !value)} className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2 text-[10px] text-[var(--muted)] hover:bg-[var(--surface2)]"><Plus className="h-3 w-3" /> Add URL</button></div>
            {resourceForm ? <form onSubmit={addResource} className="mb-4 space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3"><input required maxLength={500} value={resourceTitle} onChange={(event) => setResourceTitle(event.target.value)} placeholder="Resource title" className="!py-2 text-[11px]" /><input required type="url" maxLength={2000} value={resourceUrl} onChange={(event) => setResourceUrl(event.target.value)} placeholder="https://example.com/notes.pdf" className="!py-2 text-[11px]" />{resourceError ? <p role="alert" className="text-[10px] text-[var(--red)]">{resourceError}</p> : null}<div className="flex justify-end gap-2"><button type="button" onClick={() => setResourceForm(false)} className="rounded px-2 py-1.5 text-[10px] text-[var(--muted)]">Cancel</button><button disabled={resourceBusy} className="inline-flex items-center gap-1 rounded bg-[var(--amber)] px-2.5 py-1.5 text-[10px] font-semibold text-[#17130c]">{resourceBusy ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}Save to Shelf</button></div></form> : null}
            <div className="space-y-2">{savedResources.length ? savedResources.map((resource) => <div key={resource.id} className="flex items-start gap-2.5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3"><div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[var(--surface2)] text-[var(--amber)]"><FileText className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-medium text-[var(--text)]">{resource.title}</div><div className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--muted2)]">{resource.type}</div></div>{resource.url ? <a href={resource.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${resource.title}`} className="rounded p-1.5 text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--amber)]"><ArrowUpRight className="h-3.5 w-3.5" /></a> : null}</div>) : <div className="rounded-md border border-dashed border-[var(--border2)] px-3 py-8 text-center text-[10px] text-[var(--muted)]">No resources saved to this lecture yet.</div>}</div>
          </div>}
        </aside>
      </div>

      {ranganOpen ? <div className="fixed inset-0 z-[100] bg-black/55" onClick={(event) => { if (event.target === event.currentTarget) setRanganOpen(false); }}><aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-[430px] flex-col border-l border-[var(--border)] bg-[var(--bg)] p-3 shadow-2xl sm:p-4"><div className="mb-3 flex justify-end"><button aria-label="Close Rangan" onClick={() => setRanganOpen(false)} className="rounded-md border border-[var(--border)] p-2 text-[var(--muted)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button></div><RanganCompanion compact courseId={node.course.id} courseNodeId={node.id} courseTitle={node.course.title} nodeTitle={node.title} /></aside></div> : null}
    </div>
  );
}
