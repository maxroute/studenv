"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, BookOpen, ChevronDown, ChevronRight, FileText, Folder, GraduationCap, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";

export interface CourseTreeNode {
  id: string;
  courseId: string;
  parentId: string | null;
  type: "subject" | "topic" | "lecture";
  title: string;
  originalUrl: string | null;
  sortOrder: number;
  items: Array<{ id: string; type: string; title: string; url: string | null; excerpt: string | null; notes: string | null; createdAt: string }>;
  children: CourseTreeNode[];
}

export interface CourseDetailData {
  id: string;
  title: string;
  providerName: string;
  courseUrl: string;
  description: string | null;
  nodes: CourseTreeNode[];
}

type Draft = { type: CourseTreeNode["type"]; title: string; originalUrl: string };

async function readApiResponse<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok || !result?.ok) throw new Error(result?.error || "Could not complete that request.");
  return result.data as T;
}

function CourseNodeRow({
  node,
  depth,
  onEdit,
  onAddChild,
  onDelete,
}: {
  node: CourseTreeNode;
  depth: number;
  onEdit: (node: CourseTreeNode) => void;
  onAddChild: (node: CourseTreeNode) => void;
  onDelete: (node: CourseTreeNode) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const Icon = node.type === "lecture" ? Play : node.type === "topic" ? BookOpen : Folder;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div className="group flex min-h-14 items-center gap-2 border-b border-[var(--border)] px-3 py-2 hover:bg-[var(--surface2)]" style={{ paddingLeft: `${12 + depth * 22}px` }}>
        <button onClick={() => setExpanded((value) => !value)} disabled={!hasChildren} className="flex h-6 w-5 items-center justify-center text-[var(--muted2)] disabled:opacity-0" aria-label={expanded ? "Collapse" : "Expand"}>
          {hasChildren ? expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" /> : null}
        </button>
        <Icon className={`h-4 w-4 shrink-0 ${node.type === "lecture" ? "text-[var(--amber)]" : "text-[var(--muted)]"}`} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-[var(--text)]">{node.title}</div>
          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--muted2)]">{node.type}{node.items.length ? ` · ${node.items.length} saved item${node.items.length === 1 ? "" : "s"}` : ""}</div>
        </div>
        {node.type === "lecture" ? (
          <Link href={`/learning/study/${node.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--amber)] px-2.5 text-[11px] font-semibold text-[#17130c] hover:brightness-105"><Play className="h-3 w-3" /> Study</Link>
        ) : null}
        <button onClick={() => onAddChild(node)} title="Add a child node" className="rounded p-2 text-[var(--muted2)] hover:bg-[var(--surface3)] hover:text-[var(--amber)]"><Plus className="h-3.5 w-3.5" /></button>
        <button onClick={() => onEdit(node)} title="Edit node" className="rounded p-2 text-[var(--muted2)] hover:bg-[var(--surface3)] hover:text-[var(--text)]"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={() => onDelete(node)} title="Delete node" className="rounded p-2 text-[var(--muted2)] hover:bg-[rgba(224,90,75,.1)] hover:text-[var(--red)]"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {expanded ? node.children.map((child) => <CourseNodeRow key={child.id} node={child} depth={depth + 1} onEdit={onEdit} onAddChild={onAddChild} onDelete={onDelete} />) : null}
    </div>
  );
}

export function CourseDetail({ course }: { course: CourseDetailData }) {
  const router = useRouter();
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<CourseTreeNode | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ type: "subject", title: "", originalUrl: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function openCreate(parent: CourseTreeNode | null = null) {
    setEditing(null);
    setParentId(parent?.id ?? null);
    setDraft({ type: parent ? "topic" : "subject", title: "", originalUrl: "" });
    setError("");
    setDialog(true);
  }

  function openEdit(node: CourseTreeNode) {
    setEditing(node);
    setParentId(node.parentId);
    setDraft({ type: node.type, title: node.title, originalUrl: node.originalUrl ?? "" });
    setError("");
    setDialog(true);
  }

  async function submitNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = { ...draft, originalUrl: draft.originalUrl.trim() || null };
      const response = await fetch(
        editing ? `/api/learning/nodes/${editing.id}` : `/api/learning/courses/${course.id}/nodes`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing ? payload : { ...payload, parentId }),
        },
      );
      await readApiResponse(response);
      setDialog(false);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save this learning node.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteNode(node: CourseTreeNode) {
    const nested = node.children.length > 0;
    if (!window.confirm(`Delete “${node.title}”${nested ? " and every nested learning node" : ""}? Linked Shelf items and study history will remain.`)) return;
    try {
      await readApiResponse(await fetch(`/api/learning/nodes/${node.id}`, { method: "DELETE" }));
      router.refresh();
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : "Could not delete this node.");
    }
  }

  const nodeCount = countNodes(course.nodes);

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <Link href="/learning" className="mb-6 inline-flex items-center gap-2 text-[12px] text-[var(--muted)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> My Learning</Link>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--amber)]"><GraduationCap className="h-4 w-4" /> {course.providerName}</div>
          <h1 className="font-display text-4xl tracking-[-0.035em] text-[var(--text)]">{course.title}</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--muted)]">{course.description || "Arrange this course into the subjects, topics, and lectures that help you study."}</p>
        </div>
        <a href={course.courseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--border)] px-3.5 text-[12px] text-[var(--muted)] transition hover:bg-[var(--surface2)] hover:text-[var(--text)]">Open on provider <ArrowUpRight className="h-3.5 w-3.5" /></a>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        <Metric label="Learning nodes" value={nodeCount.toString()} />
        <Metric label="Lectures" value={countType(course.nodes, "lecture").toString()} />
        <Metric label="Saved resources" value={countResources(course.nodes).toString()} />
      </div>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <div><h2 className="font-display text-lg text-[var(--text)]">Course outline</h2><p className="mt-0.5 text-[11px] text-[var(--muted)]">Build a flexible hierarchy. Lecture playback is simulated in this MVP.</p></div>
          <button onClick={() => openCreate()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--amber)] px-3 text-[11px] font-semibold text-[#17130c]"><Plus className="h-3.5 w-3.5" /> Add subject</button>
        </div>
        {course.nodes.length ? course.nodes.map((node) => <CourseNodeRow key={node.id} node={node} depth={0} onEdit={openEdit} onAddChild={(parent) => openCreate(parent)} onDelete={(node) => void deleteNode(node)} />) : (
          <div className="px-6 py-12 text-center"><div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface2)] text-[var(--muted)]"><Folder className="h-4 w-4" /></div><p className="font-display text-xl text-[var(--text)]">Add your first subject</p><p className="mt-1 text-xs text-[var(--muted)]">Subjects can contain topics, lectures, or another level of your choosing.</p><button onClick={() => openCreate()} className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--amber)]"><Plus className="h-3.5 w-3.5" /> Add subject</button></div>
        )}
      </section>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[11px] leading-5 text-[var(--muted)]"><FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--amber)]" /> Saved notes and resources remain in Shelf and can be linked to this outline. Studenv does not import provider course data or passwords.</div>

      <Modal open={dialog} onClose={() => !busy && setDialog(false)} title={editing ? "Edit learning node" : parentId ? "Add a child node" : "Add a subject"}>
        <form onSubmit={submitNode} className="space-y-4">
          <label className="field"><span>Node type</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as Draft["type"] })}><option value="subject">Subject</option><option value="topic">Topic</option><option value="lecture">Lecture</option></select></label>
          <label className="field"><span>Title</span><input autoFocus required maxLength={250} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={draft.type === "lecture" ? "Lecture 01 · Newton's Laws" : "Mechanics"} /></label>
          {draft.type === "lecture" ? <label className="field"><span>Original lecture URL (optional)</span><input type="url" maxLength={2000} value={draft.originalUrl} onChange={(event) => setDraft({ ...draft, originalUrl: event.target.value })} placeholder="https://provider.example/lecture" /><small className="text-[11px] text-[var(--muted)]">Playback support varies. Studenv will offer an Open on provider link.</small></label> : null}
          {error ? <p role="alert" className="text-xs text-[var(--red)]">{error}</p> : null}
          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4"><button type="button" disabled={busy} onClick={() => setDialog(false)} className="rounded-md border border-[var(--border)] px-3.5 py-2 text-xs text-[var(--muted)]">Cancel</button><button disabled={busy} className="rounded-md bg-[var(--amber)] px-4 py-2 text-xs font-semibold text-[#17130c] disabled:opacity-50">{busy ? "Saving…" : editing ? "Save changes" : "Add node"}</button></div>
        </form>
      </Modal>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--muted2)]">{label}</span><span className="text-xs font-semibold text-[var(--text)]">{value}</span></div>;
}

function countNodes(nodes: CourseTreeNode[]): number { return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0); }
function countType(nodes: CourseTreeNode[], type: CourseTreeNode["type"]): number { return nodes.reduce((total, node) => total + (node.type === type ? 1 : 0) + countType(node.children, type), 0); }
function countResources(nodes: CourseTreeNode[]): number { return nodes.reduce((total, node) => total + node.items.length + countResources(node.children), 0); }
