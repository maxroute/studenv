"use client";

import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, ArrowLeft, Check, FileText, Globe, Loader2, Play, Plus, RefreshCw, SlidersHorizontal, StickyNote, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { RanganLogo } from "@/components/rangan/rangan-launcher";
import {
  dayLabel,
  localDay,
  minutesLabel,
  planSessions,
  requestStudyPlan,
  saveStudyPlan,
  settingsSummary,
} from "@/lib/client/study-plan";
import type { PlanSource, StudySource } from "@/lib/models/study.model";
import type { StudyPlanResult } from "@/lib/services/study.service";
import { PLAN_MAX_DAYS, PLAN_MAX_SOURCES, type PlanSettings } from "@/lib/study/plan";

// "Plan with Rangan": the student says what they're studying for in their own
// words; Rangan finds the material and plans the days. Sources, dates and
// time can be changed afterwards. Nothing is saved until the student adds
// the sessions to the planner.

const loadSources = async (url: string) => {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Your library could not be loaded.");
  return json.data as StudySource[];
};

const MINUTE_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Monday first, the way most study weeks are read. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const KIND_ICON = { note: StickyNote, pdf: FileText, video: Play, web: Globe } as const;

/** The plan's sources from the student's library; articles (when the library had nothing) can't be chosen or removed. */
const librarySources = (plan: StudyPlanResult): StudySource[] => plan.sources.filter((source): source is StudySource => source.kind !== "web");

function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setDate(date.getDate() + days);
  return localDay(date);
}

// 16px on phones: iOS zooms the page into any field with smaller text.
const fieldLabel = "text-[11px] uppercase tracking-wider text-[#9c9788] font-medium";
const inputClass =
  "w-full rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-[13px] max-md:text-[16px] text-[#e4dfcf] placeholder-[#5c5a52] transition focus:border-[#c97d0c] focus:outline-none";
const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#faa91f] px-5 py-2.5 text-[13px] font-semibold text-[#11110f] transition hover:bg-[#f5a016] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[13px] text-[#e4dfcf] transition hover:bg-white/[0.06] disabled:opacity-50";
const linkButton = "inline-flex items-center gap-1.5 text-[12.5px] text-[#f0c27a] transition hover:text-[#faa91f] disabled:opacity-50";

interface StudyPlanDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** A plan made in the Rangan chat, to adjust here. */
  initialPlan?: StudyPlanResult | null;
}

export function StudyPlanDialog({ open, onClose, onSaved, initialPlan }: StudyPlanDialogProps) {
  const [request, setRequest] = useState("");
  const [plan, setPlan] = useState<StudyPlanResult | null>(null);
  const [settings, setSettings] = useState<PlanSettings | null>(null);
  /** Sources the student chose; null lets Rangan find them. */
  const [chosen, setChosen] = useState<StudySource[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);
  const [busy, setBusy] = useState<"planning" | "saving" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Indexes of sessions the student removed from the plan. */
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open || !initialPlan) return;
    setPlan(initialPlan);
    setSettings(initialPlan.settings);
    setChosen(librarySources(initialPlan));
    setRequest(initialPlan.goal);
    setSkipped(new Set());
  }, [open, initialPlan]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const schedule = useMemo(() => (plan && settings ? planSessions(plan, settings) : null), [plan, settings]);
  const sourcesChanged = Boolean(plan && chosen && chosen.map((source) => source.ref).join() !== librarySources(plan).map((source) => source.ref).join());

  const reset = () => {
    setPlan(null);
    setSettings(null);
    setChosen(null);
    setPicking(false);
    setEditingSettings(false);
    setFailure(null);
    setSkipped(new Set());
  };

  const close = () => {
    if (busy) return;
    onClose();
  };

  const makePlan = async (options: { keepSettings?: boolean } = {}) => {
    const text = request.trim();
    if (!text || busy) return;
    setBusy("planning");
    setFailure(null);
    const result = await requestStudyPlan({
      request: text,
      ...(chosen && chosen.length ? { refs: chosen.map((source) => source.ref) } : {}),
      ...(options.keepSettings && settings ? { settings } : {}),
    });
    setBusy(null);
    if (!result.ok) {
      setFailure(result.message);
      if (result.needSources) setPicking(true);
      return;
    }
    setPlan(result.plan);
    setSettings(result.plan.settings);
    setChosen(librarySources(result.plan));
    setPicking(false);
    setSkipped(new Set());
  };

  const kept = schedule ? schedule.sessions.filter((_, index) => !skipped.has(index)) : [];
  const keptMinutes = kept.reduce((sum, session) => sum + session.minutes, 0);

  const savePlan = async () => {
    if (!plan || kept.length === 0 || busy) return;
    setBusy("saving");
    setFailure(null);
    const result = await saveStudyPlan(plan.goal, kept);
    setBusy(null);
    if (!result.ok) {
      setFailure(result.message);
      return;
    }
    toast.success(`Added ${kept.length} study session${kept.length === 1 ? "" : "s"} to your planner.`);
    onSaved();
    reset();
    setRequest("");
    onClose();
  };

  const updateSettings = (patch: Partial<PlanSettings>) => {
    setSettings((current) => (current ? { ...current, ...patch } : current));
    setSkipped(new Set());
  };

  if (!open) return null;

  const byDay = new Map<string, Array<{ session: (typeof kept)[number]; index: number }>>();
  schedule?.sessions.forEach((session, index) => {
    const list = byDay.get(session.day) ?? [];
    list.push({ session, index });
    byDay.set(session.day, list);
  });

  const picker = (
    <SourcePicker
      chosen={chosen ?? []}
      onChange={(next) => setChosen(next)}
      onDone={plan ? () => setPicking(false) : undefined}
    />
  );

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm md:p-6">
      <div className="absolute inset-0" onClick={close} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-plan-title"
        className="relative flex max-h-[92vh] w-full max-w-[600px] flex-col rounded-[18px] border border-white/[0.065] bg-[#141410] text-[#e4dfcf] shadow-2xl animate-in fade-in zoom-in-95 duration-200
                   max-md:absolute max-md:bottom-0 max-md:max-h-[88dvh] max-md:rounded-b-none"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <RanganLogo size={26} className="shrink-0 rounded-full" />
            <h3 id="study-plan-title" className="truncate font-[family:var(--font-fraunces)] text-[18px] font-normal">
              {plan ? plan.goal : "Plan with Rangan"}
            </h3>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy !== null}
            aria-label="Close"
            className="rounded-full bg-white/[0.03] p-1.5 text-[#9c9788] transition hover:bg-white/[0.06] hover:text-[#e4dfcf] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {plan && settings && schedule ? (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setEditingSettings((value) => !value)}
                  aria-expanded={editingSettings}
                  className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-left text-[13px] transition hover:bg-white/[0.05]"
                >
                  <span className="min-w-0">{settingsSummary(settings)}</span>
                  <span className="flex shrink-0 items-center gap-1 text-[12px] text-[#f0c27a]">
                    <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> {editingSettings ? "Done" : "Change"}
                  </span>
                </button>
                {editingSettings ? <SettingsEditor settings={settings} onChange={updateSettings} /> : null}

                <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-[#9c9788]">
                  <span>From</span>
                  {plan.sources.filter((source) => source.kind === "web").map((source) => (
                    <SourceChip key={source.ref} source={source} />
                  ))}
                  {(chosen ?? []).map((source) => (
                    <SourceChip key={source.ref} source={source} onRemove={chosen && chosen.length > 1 ? () => setChosen(chosen.filter((item) => item.ref !== source.ref)) : undefined} />
                  ))}
                  {(chosen?.length ?? 0) < PLAN_MAX_SOURCES ? (
                    <button type="button" className={linkButton} onClick={() => setPicking((value) => !value)}>
                      <Plus className="h-3.5 w-3.5" aria-hidden /> Add
                    </button>
                  ) : null}
                </div>
                {picking ? picker : null}
                {sourcesChanged ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#faa91f]/25 bg-[#faa91f]/[0.06] px-3 py-2 text-[12.5px] text-[#f0c27a]">
                    <span>Plan again from these? It uses one Rangan question.</span>
                    <button type="button" className={linkButton} onClick={() => void makePlan({ keepSettings: true })} disabled={busy !== null}>
                      {busy === "planning" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />} Plan again
                    </button>
                  </div>
                ) : null}
              </div>

              {schedule.tight ? (
                <p className="flex gap-2 rounded-[10px] border border-[#c97d0c]/30 bg-[#c97d0c]/10 px-3 py-2 text-[12.5px] text-[#f0c27a]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  There&apos;s more to learn than time allows, so sessions are shorter. More days or minutes per day would help.
                </p>
              ) : null}
              {plan.partial ? <p className="text-[12.5px] text-[#9c9788]">Your material is long, so Rangan planned from evenly spaced parts of it.</p> : null}

              {schedule.sessions.length === 0 ? (
                <p className="text-[13px] text-[#9c9788]">None of the chosen days fall between the start and finish. Change the days or dates.</p>
              ) : (
                <ol className="space-y-4">
                  {[...byDay.entries()].map(([day, entries]) => (
                    <li key={day}>
                      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[#9c9788]">{dayLabel(day)}</div>
                      <ul className="space-y-1.5">
                        {entries.map(({ session, index }) => {
                          const included = !skipped.has(index);
                          return (
                            <li key={index}>
                              <label
                                className={`flex cursor-pointer items-start gap-3 rounded-[10px] border px-3 py-2.5 transition ${
                                  included ? "border-white/[0.08] bg-white/[0.03]" : "border-white/[0.04] bg-transparent opacity-50"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={included}
                                  onChange={() =>
                                    setSkipped((current) => {
                                      const next = new Set(current);
                                      if (next.has(index)) next.delete(index);
                                      else next.add(index);
                                      return next;
                                    })
                                  }
                                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#faa91f]"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="flex flex-wrap items-baseline gap-x-2">
                                    <span className="text-[13.5px] text-[#e4dfcf]">{session.title}</span>
                                    <span className="text-[11.5px] text-[#9c9788]">{session.minutes} min</span>
                                    <span
                                      className={`rounded-full px-1.5 py-px text-[10.5px] ${
                                        session.kind === "review" ? "bg-[#8b7cf6]/15 text-[#b9adff]" : "bg-[#faa91f]/12 text-[#f0c27a]"
                                      }`}
                                    >
                                      {session.kind === "review" ? "Revision" : "Study"}
                                    </span>
                                  </span>
                                  {session.cover ? <span className="mt-0.5 block text-[12.5px] leading-snug text-[#9c9788]">{session.cover}</span> : null}
                                  {session.source ? <span className="mt-0.5 block text-[11.5px] text-[#77736a]">From: {session.source.label}</span> : null}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="shrink-0 space-y-2 border-t border-white/[0.06] px-5 py-4">
              {failure ? <p role="alert" className="text-[12.5px] text-[#f2867a]">{failure}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" className={secondaryButton} onClick={reset} disabled={busy !== null}>
                  <ArrowLeft className="h-4 w-4" aria-hidden /> Start over
                </button>
                <button type="button" className={primaryButton} onClick={savePlan} disabled={kept.length === 0 || busy !== null}>
                  {busy === "saving" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                  Add {kept.length} session{kept.length === 1 ? "" : "s"} ({minutesLabel(keptMinutes)})
                </button>
              </div>
            </div>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void makePlan();
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="space-y-1.5">
                <label htmlFor="study-plan-request" className={fieldLabel}>What are you studying for, and by when?</label>
                <textarea
                  id="study-plan-request"
                  required
                  rows={3}
                  maxLength={500}
                  placeholder="e.g. Biology test on Dec 4, about an hour on weekdays"
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void makePlan();
                    }
                  }}
                  className={`${inputClass} resize-none`}
                  autoFocus
                />
                <p className="text-[12px] text-[#77736a]">Rangan finds the material in your library and spreads it over your days. You can change anything before adding it.</p>
              </div>

              {picking ? (
                picker
              ) : (
                <button type="button" className={linkButton} onClick={() => setPicking(true)}>
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Choose the material myself
                </button>
              )}
            </div>

            <div className="shrink-0 space-y-2 border-t border-white/[0.06] px-5 py-4">
              {failure ? <p role="alert" className="text-[12.5px] text-[#f2867a]">{failure}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11.5px] text-[#77736a]">Uses one Rangan question.</span>
                <button type="submit" className={primaryButton} disabled={!request.trim() || busy !== null}>
                  {busy === "planning" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {busy === "planning" ? "Planning…" : "Make my plan"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function SourceChip({ source, onRemove }: { source: PlanSource; onRemove?: () => void }) {
  const Icon = KIND_ICON[source.kind];
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-[12px] text-[#e4dfcf]">
      <Icon className="h-3 w-3 shrink-0 text-[#9c9788]" aria-hidden />
      <span className="truncate">{source.title}</span>
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={`Remove ${source.title}`} className="-mr-1 rounded-full p-0.5 text-[#9c9788] hover:text-[#e4dfcf]">
          <X className="h-3 w-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

function SourcePicker({ chosen, onChange, onDone }: { chosen: StudySource[]; onChange: (next: StudySource[]) => void; onDone?: () => void }) {
  const { data: sources, error } = useSWR("/api/study/sources", loadSources, { revalidateOnFocus: false });
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (sources ?? []).filter((source) => words.every((word) => source.title.toLowerCase().includes(word))).slice(0, 60);
  }, [sources, query]);
  const toggle = (source: StudySource) => {
    if (chosen.some((item) => item.ref === source.ref)) onChange(chosen.filter((item) => item.ref !== source.ref));
    else if (chosen.length < PLAN_MAX_SOURCES) onChange([...chosen, source]);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={fieldLabel}>Study from</span>
        <span className="flex items-center gap-3 text-[11.5px] text-[#77736a]">
          {chosen.length}/{PLAN_MAX_SOURCES} chosen
          {onDone ? (
            <button type="button" className={linkButton} onClick={onDone}>
              Done
            </button>
          ) : null}
        </span>
      </div>
      {!onDone && chosen.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((source) => (
            <SourceChip key={source.ref} source={source} onRemove={() => toggle(source)} />
          ))}
        </div>
      ) : null}
      <input
        type="search"
        placeholder="Search your pages, PDFs and videos"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className={inputClass}
        aria-label="Search your library"
      />
      <div className="max-h-[180px] overflow-y-auto rounded-[10px] border border-white/[0.06]">
        {error ? (
          <p className="p-3 text-[12.5px] text-[#f2867a]">Your library could not be loaded.</p>
        ) : !sources ? (
          <p className="flex items-center gap-2 p-3 text-[12.5px] text-[#9c9788]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading your library…
          </p>
        ) : shown.length === 0 ? (
          <p className="p-3 text-[12.5px] text-[#9c9788]">{sources.length === 0 ? "Add notes, PDFs or videos to your library first." : "Nothing matches that search."}</p>
        ) : (
          <ul>
            {shown.map((source) => {
              const Icon = KIND_ICON[source.kind];
              const selected = chosen.some((item) => item.ref === source.ref);
              const full = !selected && chosen.length >= PLAN_MAX_SOURCES;
              return (
                <li key={source.ref}>
                  <button
                    type="button"
                    onClick={() => toggle(source)}
                    disabled={full}
                    aria-pressed={selected}
                    className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40 ${
                      selected ? "text-[#f0c27a]" : "text-[#e4dfcf]"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[#9c9788]" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{source.title}</span>
                    {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function SettingsEditor({ settings, onChange }: { settings: PlanSettings; onChange: (patch: Partial<PlanSettings>) => void }) {
  const today = localDay();
  const toggleWeekday = (day: number) => {
    const has = settings.weekdays.includes(day);
    if (has && settings.weekdays.length === 1) return;
    onChange({ weekdays: has ? settings.weekdays.filter((value) => value !== day) : [...settings.weekdays, day].sort() });
  };
  return (
    <div className="space-y-3 rounded-[10px] border border-white/[0.06] p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 space-y-1.5">
          <label htmlFor="study-plan-start" className={fieldLabel}>Start</label>
          {/* iOS Safari gives date inputs an intrinsic min width; let them shrink to their column. */}
          <input
            id="study-plan-start"
            type="date"
            min={today}
            value={settings.startDate}
            onChange={(event) => {
              const start = event.target.value;
              if (!start) return;
              const latest = addDays(start, PLAN_MAX_DAYS - 1);
              onChange({
                startDate: start,
                endDate: start > settings.endDate ? start : latest && settings.endDate > latest ? latest : settings.endDate,
              });
            }}
            className={`${inputClass} block min-w-0 appearance-none [color-scheme:dark]`}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <label htmlFor="study-plan-end" className={fieldLabel}>Finish by</label>
          <input
            id="study-plan-end"
            type="date"
            min={settings.startDate}
            max={addDays(settings.startDate, PLAN_MAX_DAYS - 1)}
            value={settings.endDate}
            onChange={(event) => event.target.value && onChange({ endDate: event.target.value })}
            className={`${inputClass} block min-w-0 appearance-none [color-scheme:dark]`}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <span className={fieldLabel}>Study days</span>
        <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Study days">
          {WEEKDAY_ORDER.map((day) => {
            const on = settings.weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() => toggleWeekday(day)}
                className={`rounded-[8px] border py-2 text-[12px] transition ${
                  on ? "border-[#faa91f]/40 bg-[#faa91f]/15 text-[#f0c27a]" : "border-white/[0.08] bg-white/[0.02] text-[#77736a]"
                }`}
              >
                {WEEKDAY_LABELS[day]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="study-plan-minutes" className={fieldLabel}>Time per study day</label>
        <select
          id="study-plan-minutes"
          value={settings.minutesPerDay}
          onChange={(event) => onChange({ minutesPerDay: Number(event.target.value) })}
          className="w-full appearance-none rounded-[8px] border border-white/[0.08] bg-[#1a1a14] px-3.5 py-2.5 text-[13px] max-md:text-[16px] text-[#e4dfcf] focus:border-[#c97d0c] focus:outline-none"
        >
          {[...new Set([...MINUTE_OPTIONS, settings.minutesPerDay])].sort((a, b) => a - b).map((minutes) => (
            <option key={minutes} value={minutes}>{minutesLabel(minutes)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
