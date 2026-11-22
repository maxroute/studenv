"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarDays, Check, Loader2, SlidersHorizontal } from "lucide-react";
import { useRanganStore, type RanganTurn } from "@/hooks/use-rangan-store";
import { useStudyPlanDraft } from "@/hooks/use-study-plan-draft";
import { useVoiceAction } from "@/hooks/use-voice-action";
import { dayLabel, minutesLabel, planSessions, saveStudyPlan, settingsSummary } from "@/lib/client/study-plan";

/** Sessions listed in the card before "and N more". */
const SHOWN_SESSIONS = 6;
const PLANNER_PATH = "/dashboard/planner";

/** A study plan in the Rangan chat: add it to the planner as it is, or adjust it there. */
export function RanganPlanCard({ turn, onNavigate }: { turn: Extract<RanganTurn, { role: "plan" }>; onNavigate: () => void }) {
  const router = useRouter();
  const markPlanSaved = useRanganStore((state) => state.markPlanSaved);
  const { plan } = turn;
  const schedule = useMemo(() => planSessions(plan), [plan]);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const total = schedule.sessions.reduce((sum, session) => sum + session.minutes, 0);

  const add = async () => {
    if (saving || schedule.sessions.length === 0) return false;
    setSaving(true);
    setFailure(null);
    const result = await saveStudyPlan(plan.goal, schedule.sessions);
    setSaving(false);
    if (result.ok) markPlanSaved(turn.id, schedule.sessions.length);
    else setFailure(result.message);
    return result.ok;
  };
  useVoiceAction(turn.id, turn.saved === null ? add : null);

  const openPlanner = (adjust: boolean) => {
    if (adjust) useStudyPlanDraft.getState().setDraft(plan);
    onNavigate();
    router.push(PLANNER_PATH);
  };

  return (
    <div className="rangan-plan">
      <div className="rangan-plan-head">
        <CalendarDays size={16} aria-hidden />
        <span className="rangan-plan-goal">{plan.goal}</span>
      </div>
      <p className="rangan-plan-meta">{settingsSummary(plan.settings)}</p>
      <p className="rangan-plan-meta">
        {plan.topics.length} topic{plan.topics.length === 1 ? "" : "s"} from {plan.sources.map((source) => source.title).join(", ")}
      </p>
      {plan.sources.some((source) => source.kind === "web") ? (
        <p className="rangan-plan-meta">Your library had nothing on this yet, so Rangan planned from Wikipedia.</p>
      ) : null}
      {schedule.tight ? <p className="rangan-plan-note">There&apos;s more to learn than time allows, so sessions are shorter.</p> : null}

      <ol className="rangan-plan-list">
        {schedule.sessions.slice(0, SHOWN_SESSIONS).map((session, index) => (
          <li key={index} className="rangan-plan-row">
            <span className="rangan-plan-day">{dayLabel(session.day)}</span>
            <span className="rangan-plan-title">{session.title}</span>
            <span className="rangan-plan-min">{minutesLabel(session.minutes)}</span>
          </li>
        ))}
      </ol>
      {schedule.sessions.length > SHOWN_SESSIONS ? (
        <p className="rangan-plan-meta">and {schedule.sessions.length - SHOWN_SESSIONS} more, until {dayLabel(plan.settings.endDate)}</p>
      ) : null}

      {failure ? (
        <p className="rangan-plan-note" role="alert">
          {failure}
        </p>
      ) : null}
      {turn.saved !== null ? (
        <div className="rangan-plan-actions">
          <span className="rangan-plan-saved">
            <CalendarCheck size={15} aria-hidden /> Added {turn.saved} session{turn.saved === 1 ? "" : "s"} to your planner
          </span>
          <button type="button" className="rangan-chip" onClick={() => openPlanner(false)}>
            Open planner
          </button>
        </div>
      ) : (
        <div className="rangan-plan-actions">
          <button type="button" className="rangan-plan-add" onClick={() => void add()} disabled={saving || schedule.sessions.length === 0}>
            {saving ? <Loader2 size={15} className="rangan-spin" aria-hidden /> : <Check size={15} aria-hidden />}
            Add {schedule.sessions.length} session{schedule.sessions.length === 1 ? "" : "s"} ({minutesLabel(total)})
          </button>
          <button type="button" className="rangan-chip" onClick={() => openPlanner(true)} disabled={saving}>
            <SlidersHorizontal size={14} aria-hidden /> Adjust
          </button>
        </div>
      )}
    </div>
  );
}
