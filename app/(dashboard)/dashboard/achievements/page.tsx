"use client";

import { useMemo } from "react";
import { Flame, Lock, Medal, Sparkles, AlertCircle } from "lucide-react";
import useSWR from "swr";

const fetcher = async (url: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch (err) {
    return null;
  }
};

function AchievementsSkeleton() {
  return (
    <div className="min-h-full px-10 py-9 animate-pulse">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <div className="h-8 w-64 bg-white/5 rounded-md mb-2"></div>
          <div className="h-4 w-48 bg-white/5 rounded-md"></div>
        </div>

        <div className="mb-8 grid max-w-[620px] gap-3 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-[14px] border border-white/[0.065] bg-[#1b1b16] px-5 py-[18px]"
            >
              <div className="mb-3 h-[34px] w-[34px] rounded-[9px] bg-white/5"></div>
              <div className="h-3 w-16 bg-white/5 rounded mb-2"></div>
              <div className="h-7 w-24 bg-white/5 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AchievementsPage() {
  const { data, error, isLoading } = useSWR("/api/analytics", fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshInterval: 5000,
  });

  const totals = useMemo(() => {
    if (!data?.stats) {
      return { sessions: 0, focusMinutes: 0, streak: 0 };
    }

    const { focusSessions, totalFocusMs, currentStreak } = data.stats;
    return {
      sessions: focusSessions || 0,
      focusMinutes: Math.round((totalFocusMs || 0) / 60000),
      streak: currentStreak || 0,
    };
  }, [data]);

  const achievements = useMemo(() => {
    return [
      {
        icon: Flame,
        name: "First Flame",
        desc: "Complete your first focus session.",
        progress: Math.min(100, totals.sessions >= 1 ? 100 : totals.sessions * 100),
        label: totals.sessions >= 1 ? "Completed" : `${totals.sessions} / 1`,
        done: totals.sessions >= 1,
      },
      {
        icon: Sparkles,
        name: "Deep Diver",
        desc: "Complete 10 focus sessions.",
        progress: Math.min(100, (totals.sessions / 10) * 100),
        label: `${Math.min(totals.sessions, 10)} / 10`,
        done: totals.sessions >= 10,
      },
      {
        icon: Medal,
        name: "Week Warrior",
        desc: "Maintain a 7-day streak.",
        progress: Math.min(100, (totals.streak / 7) * 100),
        label: `${Math.min(totals.streak, 7)} / 7 days`,
        done: totals.streak >= 7,
      },
      {
        icon: Lock,
        name: "Diamond Mind",
        desc: "Reach 10 hours of focus and a 7-day streak.",
        progress:
          totals.focusMinutes >= 600 && totals.streak >= 7
            ? 100
            : Math.min(100, ((totals.focusMinutes / 600) * 60) + ((totals.streak / 7) * 40)),
        label:
          totals.focusMinutes >= 600 && totals.streak >= 7
            ? "Completed"
            : "Locked",
        done: totals.focusMinutes >= 600 && totals.streak >= 7,
        locked: totals.focusMinutes < 600 || totals.streak < 7,
      },
    ];
  }, [totals]);

  if (isLoading) return <AchievementsSkeleton />;

  if (error || !data) {
    return (
      <div className="min-h-full px-10 py-9 flex items-center justify-center">
        <div className="flex flex-col items-center text-[#9c9788] gap-3">
          <AlertCircle className="w-8 h-8 text-red-500/50" />
          <p>Failed to load achievements. Please try again.</p>
        </div>
      </div>
    );
  }

  const unlocked = achievements.filter((item) => item.done);
  const inProgress = achievements.filter((item) => !item.done);

  return (
    <div className="min-h-full px-10 py-9">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="font-[family:var(--font-fraunces)] text-[32px] font-normal leading-none text-[#e4dfcf]">
            Achievements
          </h1>
          <p className="mt-2 text-[13px] text-[#9c9788]">
            Track your milestones and keep the momentum going.
          </p>
        </div>

        <div className="mb-8 grid max-w-[620px] gap-3 md:grid-cols-3">
          {[
            {
              label: "Unlocked",
              value: unlocked.length,
              icon: Medal,
              iconClass: "bg-[rgba(201,125,12,0.15)] text-[#c97d0c]",
            },
            {
              label: "In Progress",
              value: inProgress.length,
              icon: Sparkles,
              iconClass: "bg-[rgba(26,158,117,0.15)] text-[#1a9e75]",
            },
            {
              label: "Focus Hours",
              value: (totals.focusMinutes / 60).toFixed(1),
              icon: Flame,
              iconClass: "bg-[rgba(136,120,212,0.15)] text-[#8878d4]",
            },
          ].map((stat) => {
            const Icon = stat.icon;

            return (
              <div
                key={stat.label}
                className="rounded-[14px] border border-white/[0.065] bg-[#1b1b16] px-5 py-[18px]"
              >
                <div
                  className={`mb-3 flex h-[34px] w-[34px] items-center justify-center rounded-[9px] ${stat.iconClass}`}
                >
                  <Icon className="h-[17px] w-[17px]" />
                </div>
                <div className="text-[11px] text-[#9c9788]">{stat.label}</div>
                <div className="mt-1 font-[family:var(--font-fraunces)] text-[28px] leading-none text-[#e4dfcf]">
                  {stat.value}
                </div>
              </div>
            );
          })}
        </div>

        <section className="mb-7">
          <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.09em] text-[#5c5a52]">
            <Medal className="h-3.5 w-3.5" />
            Unlocked
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {unlocked.length ? (
              unlocked.map((achievement) => {
                const Icon = achievement.icon;

                return (
                  <article
                    key={achievement.name}
                    className="rounded-[14px] border border-white/[0.065] bg-[#1b1b16] px-5 py-5"
                  >
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(26,158,117,0.13)] text-[#1a9e75]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="text-[15px] text-[#e4dfcf]">{achievement.name}</h2>
                    <p className="mt-1 text-[12px] leading-6 text-[#9c9788]">
                      {achievement.desc}
                    </p>
                    <div className="mt-4 h-2 rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-[#1a9e75]" style={{ width: "100%" }} />
                    </div>
                    <div className="mt-2 text-[11px] text-[#1a9e75]">{achievement.label}</div>
                  </article>
                );
              })
            ) : (
              <div className="rounded-[14px] border border-dashed border-white/[0.1] bg-[#1b1b16] px-5 py-6 text-[13px] text-[#9c9788]">
                Complete your first focus session to unlock your first achievement.
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.09em] text-[#5c5a52]">
            <Lock className="h-3.5 w-3.5" />
            In Progress
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {inProgress.map((achievement) => {
              const Icon = achievement.icon;

              return (
                <article
                  key={achievement.name}
                  className={`rounded-[14px] border px-5 py-5 ${
                    achievement.locked
                      ? "border-white/[0.05] bg-[#171712] opacity-80"
                      : "border-white/[0.065] bg-[#1b1b16]"
                  }`}
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-[#c97d0c]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-[15px] text-[#e4dfcf]">{achievement.name}</h2>
                  <p className="mt-1 text-[12px] leading-6 text-[#9c9788]">
                    {achievement.desc}
                  </p>
                  <div className="mt-4 h-2 rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-[#c97d0c]"
                      style={{ width: `${achievement.progress}%` }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-[#9c9788]">{achievement.label}</div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
