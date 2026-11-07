"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BookOpen, GraduationCap, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";

export interface CourseSummary {
  id: string;
  title: string;
  providerName: string;
  courseUrl: string;
  description: string | null;
  _count: { nodes: number };
}

type CourseDraft = Pick<CourseSummary, "title" | "providerName" | "courseUrl" | "description">;

const EMPTY_DRAFT: CourseDraft = {
  title: "",
  providerName: "",
  courseUrl: "",
  description: "",
};

async function readApiResponse<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || "Could not complete that request.");
  }
  return result.data as T;
}

export function CourseLibrary({ courses }: { courses: CourseSummary[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CourseSummary | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState<CourseDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function openAdd() {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setError("");
    setIsAdding(true);
  }

  function openEdit(course: CourseSummary) {
    setEditing(course);
    setDraft({
      title: course.title,
      providerName: course.providerName,
      courseUrl: course.courseUrl,
      description: course.description ?? "",
    });
    setError("");
    setIsAdding(true);
  }

  async function submitCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        editing ? `/api/learning/courses/${editing.id}` : "/api/learning/courses",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...draft, description: draft.description || null }),
        },
      );
      await readApiResponse(response);
      setIsAdding(false);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save the course.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCourse(course: CourseSummary) {
    if (!window.confirm(`Delete “${course.title}” and its learning outline? Shelf items and study history will remain.`)) return;
    try {
      await readApiResponse(await fetch(`/api/learning/courses/${course.id}`, { method: "DELETE" }));
      router.refresh();
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : "Could not delete the course.");
    }
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
            <GraduationCap className="h-4 w-4 text-[var(--amber)]" /> Learning library
          </div>
          <h1 className="font-display text-4xl tracking-[-0.035em] text-[var(--text)] sm:text-[42px]">My Learning</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
            Organize the courses and subscriptions you already use. Studenv stores your links and learning outline.
          </p>
        </div>
        <button onClick={openAdd} className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--amber)] px-4 text-[13px] font-semibold text-[#17130c] transition hover:brightness-105">
          <Plus className="h-4 w-4" /> Add course
        </button>
      </header>

      {courses.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <article key={course.id} className="group flex min-h-[208px] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:border-[var(--border2)]">
              <div className="mb-5 flex items-start justify-between gap-3">
                <span className="rounded border border-[var(--amber-dim)] bg-[var(--amber-glow)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--amber)]">{course.providerName}</span>
                <div className="flex items-center gap-1 opacity-70 transition group-hover:opacity-100">
                  <button onClick={() => openEdit(course)} className="rounded px-2 py-1 text-[11px] text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--text)]">Edit</button>
                  <button aria-label={`Delete ${course.title}`} onClick={() => void deleteCourse(course)} className="rounded p-1.5 text-[var(--muted)] hover:bg-[rgba(224,90,75,.1)] hover:text-[var(--red)]"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <Link href={`/learning/${course.id}`} className="group/title flex-1">
                <h2 className="font-display text-[22px] leading-tight tracking-[-0.02em] text-[var(--text)] group-hover/title:text-[var(--amber)]">{course.title}</h2>
                <p className="mt-2 line-clamp-2 min-h-10 text-[12px] leading-5 text-[var(--muted)]">{course.description || "Build a subject and lecture outline for this course."}</p>
              </Link>
              <div className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-3 text-[11px] text-[var(--muted)]">
                <span className="inline-flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" /> {course._count.nodes} learning nodes</span>
                <div className="flex items-center gap-3">
                  <a href={course.courseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--text)]" aria-label={`Open ${course.title} at ${course.providerName}`}>
                    Provider <ArrowUpRight className="h-3 w-3" />
                  </a>
                  <Link href={`/learning/${course.id}`} className="font-medium text-[var(--amber)] hover:brightness-125">Open course</Link>
                </div>
              </div>
            </article>
          ))}
          <button onClick={openAdd} className="flex min-h-[208px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border2)] bg-transparent text-[var(--muted)] transition hover:border-[var(--amber-dim)] hover:bg-[var(--amber-glow)] hover:text-[var(--text)]">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border2)]"><Plus className="h-4 w-4" /></span>
            <span className="text-[12px]">Add another course</span>
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--amber-dim)] bg-[var(--amber-glow)] text-[var(--amber)]"><GraduationCap className="h-5 w-5" /></div>
          <h2 className="font-display text-2xl text-[var(--text)]">Start with a course you already have</h2>
          <p className="mx-auto mt-2 max-w-lg text-[13px] leading-6 text-[var(--muted)]">Add a coaching subscription, then organize subjects, topics, and lecture links. Provider sign-in and playback stay with the provider.</p>
          <button onClick={openAdd} className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-[var(--amber)] px-4 text-[13px] font-semibold text-[#17130c]"><Plus className="h-4 w-4" /> Add your first course</button>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted2)]">Physics Wallah · Unacademy · Allen Digital · Vedantu</p>
        </div>
      )}

      <Modal open={isAdding} onClose={() => !busy && setIsAdding(false)} title={editing ? "Edit course" : "Add a course"}>
        <form onSubmit={submitCourse} className="space-y-4">
          <label className="field"><span>Course name</span><input autoFocus required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="JEE Preparation 2026" /></label>
          <label className="field"><span>Coaching provider</span><input required maxLength={100} value={draft.providerName} onChange={(event) => setDraft({ ...draft, providerName: event.target.value })} placeholder="Physics Wallah" /></label>
          <label className="field"><span>Course URL</span><input required type="url" maxLength={2000} value={draft.courseUrl} onChange={(event) => setDraft({ ...draft, courseUrl: event.target.value })} placeholder="https://provider.example/course" /><small className="text-[11px] leading-5 text-[var(--muted)]">Saved for quick access. Studenv does not collect provider passwords.</small></label>
          <label className="field"><span>Optional description</span><textarea rows={3} maxLength={2000} value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Batch, exam, or study goal" /></label>
          {error ? <p role="alert" className="text-xs text-[var(--red)]">{error}</p> : null}
          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button type="button" onClick={() => setIsAdding(false)} disabled={busy} className="rounded-md border border-[var(--border)] px-3.5 py-2 text-xs text-[var(--muted)] hover:bg-[var(--surface2)]">Cancel</button>
            <button disabled={busy} className="rounded-md bg-[var(--amber)] px-4 py-2 text-xs font-semibold text-[#17130c] disabled:opacity-50">{busy ? "Saving…" : editing ? "Save changes" : "Add course"}</button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
