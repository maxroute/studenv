"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  Brain,
  Clock3,
  PlayCircle,
  Trophy,
  AlertCircle,
} from "lucide-react";
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

function formatTotalHours(hours: number) {
  const safeHours = Number.isFinite(Number(hours)) ? Number(hours) : 0;
  return `${safeHours.toFixed(1)}h`;
}

function DashboardSkeleton() {
  return (
    <div className="min-h-full px-10 pb-28 pt-9 animate-pulse">
      <div className="mx-auto max-w-6xl">
        <div className="dashboard-home-hero mb-8 flex flex-col gap-5">
          <div>
            <div className="h-8 w-64 bg-white/5 rounded-md mb-2"></div>
            <div className="h-4 w-48 bg-white/5 rounded-md"></div>
          </div>
          <div className="h-10 w-40 bg-white/5 rounded-[8px]"></div>
        </div>

        <div className="mb-8 grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-5 py-[18px]"
            >
              <div className="mb-3 h-[34px] w-[34px] rounded-[9px] bg-white/5"></div>
              <div className="h-3 w-16 bg-white/5 rounded mb-2"></div>
              <div className="h-7 w-24 bg-white/5 rounded"></div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
          <section className="space-y-4">
            <div className="h-4 w-32 bg-white/5 rounded"></div>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 rounded-[8px] bg-[var(--surface)] border border-[var(--border)]"
              ></div>
            ))}
          </section>
          <aside className="space-y-4">
            <div className="h-4 w-20 bg-white/5 rounded"></div>
            <div className="h-64 rounded-[8px] bg-[var(--surface)] border border-[var(--border)]"></div>
          </aside>
        </div>
        <div aria-hidden="true" style={{ height: 40 }} />
      </div>
    </div>
  );
}

export function DashboardClient() {
  const { data, error, isLoading } = useSWR("/api/dashboard", fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshInterval: 5000, // optionally refresh every 5 seconds to ensure instant update
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <div className="min-h-full px-10 py-9 flex items-center justify-center">
        <div className="flex flex-col items-center text-[var(--muted)] gap-3">
          <AlertCircle className="w-8 h-8 text-red-500/50" />
          <p>Failed to load dashboard data. Please try again.</p>
        </div>
      </div>
    );
  }

  const { viewer, stats, recentSessions, upNext } = data;
  const firstName = viewer?.firstName || "Scholar";

  const statCards = [
    {
      label: "Study streak",
      value: `${stats.streak} day${stats.streak === 1 ? "" : "s"}`,
      icon: Brain,
      iconClass: "bg-[var(--amber-glow)] text-[var(--amber)]",
    },
    {
      label: "Total XP",
      value: stats.totalXP.toLocaleString(),
      icon: Trophy,
      iconClass: "bg-[rgba(90,191,122,0.14)] text-[var(--green)]",
    },
    {
      label: "Total hours",
      value: formatTotalHours(stats.focusHours),
      icon: Clock3,
      iconClass: "bg-[rgba(155,127,232,0.14)] text-[var(--purple)]",
    },
  ];

  return (
    <div className="min-h-full px-10 pb-28 pt-9">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="mx-auto max-w-6xl"
      >
        <div className="dashboard-home-hero mb-8 flex gap-5">
          <div>
            <h1 className="font-[family:var(--font-fraunces)] text-[32px] font-normal leading-none text-[var(--text)]">
              Welcome back, {firstName}
            </h1>
            <p className="mt-2 text-[13px] text-[var(--muted)]">
              Ready to expand your shelf today?
            </p>
          </div>

          <Link
            href="/dashboard/focus"
            className="dashboard-focus-cta inline-flex items-center justify-center gap-2 rounded-[8px] bg-[var(--amber)] px-4 py-2.5 text-[13px] text-[#0e0e0e] transition hover:opacity-85"
          >
            <PlayCircle className="h-4.5 w-4.5" />
            Start Focus Session
          </Link>
        </div>

        <div className="mb-8 grid gap-3 md:grid-cols-3">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-5 py-[18px]"
              >
                <div
                  className={`mb-3 flex h-[34px] w-[34px] items-center justify-center rounded-[9px] ${stat.iconClass}`}
                >
                  <Icon className="h-[17px] w-[17px]" />
                </div>
                <div className="text-[11px] text-[var(--muted)]">{stat.label}</div>
                <div className="mt-1 font-[family:var(--font-fraunces)] text-[28px] font-normal leading-none text-[var(--text)]">
                  {stat.value}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
          <section>
            <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.09em] text-[var(--muted2)]">
              <BookOpen className="h-3.5 w-3.5" />
              Recent Sessions
            </div>

            <div className="space-y-2">
              {recentSessions.length === 0 ? (
                <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center text-[12px] text-[var(--muted)]">
                  No recent sessions found. Start adding items to your shelf!
                </div>
              ) : (
                recentSessions.map((session: any) => (
                  <div
                    key={session.id}
                    className="cursor-pointer rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 transition hover:border-[var(--border2)]"
                  >
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <span className="rounded-[5px] bg-white/[0.06] px-[9px] py-[2px] text-[11px] text-[var(--muted)] capitalize">
                        {session.type}
                      </span>
                      <span className="text-[11px] text-[var(--muted2)]">
                        {new Date(session.createdAt).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" },
                        )}
                      </span>
                    </div>
                    <h2 className="mb-2 text-[14px] text-[var(--text)] line-clamp-1">
                      {session.title}
                    </h2>
                    <div className="flex flex-wrap gap-3.5 text-[11px] text-[var(--muted)]">
                      <span className="flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-[var(--amber)]" />
                        {session.summary}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <aside>
            <div className="mb-3 text-[11px] uppercase tracking-[0.09em] text-[var(--muted2)]">
              Up Next
            </div>

            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-center">
              <div className="mx-auto mb-4 flex h-[50px] w-[50px] items-center justify-center rounded-full bg-[rgba(90,191,122,0.14)] text-[var(--green)]">
                <BookOpen className="h-5.5 w-5.5" />
              </div>
              <h3 className="text-[15px] text-[var(--text)]">{upNext.title}</h3>
              <p className="mx-auto mb-4 mt-1 max-w-[220px] text-[12px] leading-6 text-[var(--muted)]">
                {upNext.description}
              </p>
              <Link
                href="/shelf"
                className="inline-flex w-full items-center justify-center rounded-[8px] bg-[var(--green)] px-4 py-2.5 text-[13px] text-white transition hover:opacity-85"
              >
                {upNext.actionLabel}
              </Link>
            </div>
          </aside>
        </div>
        <div aria-hidden="true" style={{ height: 40 }} />
      </motion.div>
    </div>
  );
}
