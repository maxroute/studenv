"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { RanganCompanion } from "@/components/learning/RanganCompanion";

interface ContextCourse {
  id: string;
  title: string;
  providerName: string;
  nodes: Array<{ id: string; parentId: string | null; type: string; title: string }>;
}

export function RanganLanding({ courses }: { courses: ContextCourse[] }) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const course = courses.find((item) => item.id === courseId) ?? null;
  const [nodeId, setNodeId] = useState("");
  const selectedNodeId = course?.nodes.some((node) => node.id === nodeId) ? nodeId : "";
  const selectedNode = course?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const nodeLabels = useMemo(() => {
    if (!course) return new Map<string, string>();
    const nodes = new Map(course.nodes.map((node) => [node.id, node]));
    return new Map(course.nodes.map((node) => {
      const path = [node.title];
      let parentId = node.parentId;
      const visited = new Set<string>([node.id]);
      while (parentId && nodes.has(parentId) && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = nodes.get(parentId)!;
        path.unshift(parent.title);
        parentId = parent.parentId;
      }
      return [node.id, `${path.join(" / ")} · ${node.type}`];
    }));
  }, [course]);

  return <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:px-10 lg:py-10">
    <header className="mb-6"><div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--amber)]"><Sparkles className="h-4 w-4" /> Rangan · Studenv learning companion</div><h1 className="font-display text-4xl tracking-[-0.035em] text-[var(--text)]">Think through your learning</h1><p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--muted)]">Choose a course node to give Rangan its learning path and linked Shelf notes. The companion is also available inside Focus Studio.</p></header>
    {courses.length ? <div className="mb-5 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end sm:p-5">
      <label className="field"><span>Course</span><select value={courseId} onChange={(event) => { setCourseId(event.target.value); setNodeId(""); }}><option value="">Choose a course</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.providerName}</option>)}</select></label>
      <label className="field"><span>Learning context</span><select value={selectedNodeId} onChange={(event) => setNodeId(event.target.value)} disabled={!course?.nodes.length}><option value="">Choose a subject, topic, or lecture</option>{course?.nodes.map((node) => <option key={node.id} value={node.id}>{nodeLabels.get(node.id)}</option>)}</select></label>
      {course ? <Link href={`/learning/${course.id}`} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-[11px] text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--text)]">Course outline <ArrowRight className="h-3 w-3" /></Link> : null}
      {!course?.nodes.length ? <p className="text-[10px] text-[var(--muted2)] sm:col-span-2">Add subjects or lectures to this course to select context.</p> : null}
    </div> : <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[12px] text-[var(--muted)]">Add a course and learning outline to use Rangan with your selected material. <Link href="/learning" className="ml-1 text-[var(--amber)]">Go to My Learning →</Link></div>}
    <RanganCompanion key={selectedNodeId || courseId || "empty"} courseId={course?.id ?? null} courseNodeId={selectedNodeId || null} courseTitle={course?.title} nodeTitle={selectedNode?.title} />
  </section>;
}
