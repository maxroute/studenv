import Link from "next/link";
import { ArrowLeft, BookOpen, CheckCircle2, Clock3, GraduationCap, Timer } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import * as learningService from "@/lib/services/learning.service";

export const dynamic = "force-dynamic";

export default async function LearningProgressPage() {
  const user = await requireAuth();
  const progress = await learningService.getLearningProgress(user.id);
  const metrics = [
    { label: "Courses organized", value: progress.courses, icon: GraduationCap },
    { label: "Recorded focus sessions", value: progress.focusSessions, icon: Timer },
    { label: "Focus time", value: `${progress.focusMinutes} min`, icon: Clock3 },
    { label: "Learning tasks completed", value: progress.completedTasks, icon: CheckCircle2 },
    { label: "Saved learning materials", value: progress.savedMaterials, icon: BookOpen },
  ];

  return <section className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
    <Link href="/learning" className="mb-6 inline-flex items-center gap-2 text-[12px] text-[var(--muted)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> My Learning</Link>
    <div className="mb-8"><div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--amber)]"><GraduationCap className="h-4 w-4" /> Learning activity</div><h1 className="font-display text-4xl tracking-[-0.035em] text-[var(--text)]">Progress</h1><p className="mt-2 max-w-xl text-[13px] leading-6 text-[var(--muted)]">A record of study activity you explicitly complete in Studenv.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(({ label, value, icon: Icon }) => <article key={label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"><div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--amber-dim)] bg-[var(--amber-glow)] text-[var(--amber)]"><Icon className="h-4 w-4" /></div><div className="mt-5 font-display text-3xl text-[var(--text)]">{value}</div><div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted2)]">{label}</div></article>)}</div>
    <p className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[11px] leading-5 text-[var(--muted)]">{progress.trackingNote}</p>
  </section>;
}
