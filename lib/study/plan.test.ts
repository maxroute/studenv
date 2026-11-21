import assert from "node:assert/strict";
import test from "node:test";
import { studyPlanRequestSchema } from "@/lib/models/study.model";
import { isPlanRequest, refersToOpen } from "./plan-intent";
import { createStudyService, type LoadedStudySource, type StudyDeps } from "@/lib/services/study.service";
import {
  buildPlanSessions,
  MIN_SESSION_MINUTES,
  parseDay,
  parsePlanReply,
  pickPlanSources,
  planSearchQuery,
  planSessionTask,
  resolvePlanSettings,
  scheduleStudyPlan,
  studyDays,
  type PlanTopic,
} from "./plan";

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const topic = (title: string, effort: PlanTopic["effort"] = 2) => ({ title, cover: `Learn ${title}.`, effort });

test("days are real calendar dates", () => {
  assert.equal(parseDay("2026-11-20"), Date.UTC(2026, 10, 20));
  assert.equal(parseDay("2026-02-30"), null);
  assert.equal(parseDay("2026-1-5"), null);
  assert.equal(parseDay("tomorrow"), null);
});

test("study days are inclusive, follow the chosen weekdays and cross months", () => {
  // 2026-11-27 is a Friday; the weekend is skipped.
  assert.deepEqual(studyDays("2026-11-27", "2026-12-01", WEEKDAYS), ["2026-11-27", "2026-11-30", "2026-12-01"]);
  assert.deepEqual(studyDays("2026-11-20", "2026-11-20", EVERY_DAY), ["2026-11-20"]);
  assert.deepEqual(studyDays("2026-11-21", "2026-11-20", EVERY_DAY), []);
  assert.deepEqual(studyDays("2026-11-21", "2026-11-22", WEEKDAYS), [], "a weekend with weekdays only has no days");
});


test("the reply gives the request's goal, finish, time and days, and well-formed topics in order", () => {
  const reply = `Sure:\n${JSON.stringify({
    goal: "  Biology   test ",
    finish: "2026-12-03",
    minutesPerDay: "60",
    days: ["Mon", "tuesday", "wed", "thu", "fri", "funday", "mon"],
    topics: [
      { title: "Cells", cover: "What  cells are.", effort: 1, passage: 1 },
      { title: "cells", cover: "again", effort: 2 },
      { title: "", cover: "no title" },
      { title: "Mitosis", effort: "3", passage: 9 },
      { title: "Meiosis", effort: 7, passage: "2" },
    ],
  })}`;
  assert.deepEqual(parsePlanReply(reply, 2), {
    goal: "Biology test",
    endDate: "2026-12-03",
    minutesPerDay: 60,
    weekdays: [1, 2, 3, 4, 5],
    topics: [
      { title: "Cells", cover: "What cells are.", effort: 1, passage: 0 },
      { title: "Mitosis", cover: "", effort: 3, passage: null },
      { title: "Meiosis", cover: "", effort: 2, passage: 1 },
    ],
  });
});

test("a reply without settings, or with only a topic array, still gives topics", () => {
  const bare = parsePlanReply(JSON.stringify([{ title: "Cells", effort: 2, passage: 1 }]), 1);
  assert.deepEqual([bare.goal, bare.endDate, bare.minutesPerDay, bare.weekdays, bare.topics.length], [null, null, null, null, 1]);
  const nulls = parsePlanReply(JSON.stringify({ goal: null, finish: "next week", minutesPerDay: null, days: null, topics: [{ title: "A" }] }), 1);
  assert.deepEqual([nulls.goal, nulls.endDate, nulls.minutesPerDay, nulls.weekdays], [null, null, null, null]);
  assert.deepEqual(parsePlanReply("sorry, I can't", 3).topics, []);
});

test("settings start today and fall back to two weeks, 45 minutes and every day", () => {
  assert.deepEqual(resolvePlanSettings("2026-11-21", { endDate: null, minutesPerDay: null, weekdays: null }), {
    startDate: "2026-11-21",
    endDate: "2026-12-04",
    minutesPerDay: 45,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  });
});

test("settings keep a usable finish and clamp the rest", () => {
  const asked = resolvePlanSettings("2026-11-21", { endDate: "2026-12-03", minutesPerDay: 62, weekdays: [1, 2, 3, 4, 5] });
  assert.deepEqual(asked, { startDate: "2026-11-21", endDate: "2026-12-03", minutesPerDay: 60, weekdays: [1, 2, 3, 4, 5] });
  assert.equal(resolvePlanSettings("2026-11-21", { endDate: "2026-11-01", minutesPerDay: null, weekdays: null }).endDate, "2026-12-04", "a past date is ignored");
  assert.equal(resolvePlanSettings("2026-11-21", { endDate: "2027-06-01", minutesPerDay: null, weekdays: null }).endDate, "2027-02-18", "at most 90 days");
  assert.equal(resolvePlanSettings("2026-11-21", { endDate: null, minutesPerDay: 600, weekdays: null }).minutesPerDay, 240);
  assert.equal(resolvePlanSettings("2026-11-21", { endDate: null, minutesPerDay: 5, weekdays: null }).minutesPerDay, MIN_SESSION_MINUTES);
  // Only Sundays, finishing on a Saturday a day later: no study day, so every day is used.
  assert.deepEqual(resolvePlanSettings("2026-11-20", { endDate: "2026-11-21", minutesPerDay: null, weekdays: [0] }).weekdays, [0, 1, 2, 3, 4, 5, 6]);
});

test("the library search uses the subject words of the request, not its dates and times", () => {
  assert.equal(planSearchQuery("Biology test on Dec 4, I can study about an hour on weekdays"), "Biology");
  assert.equal(planSearchQuery("Plan my photosynthesis exam for next Friday, 30 mins a day"), "photosynthesis");
  assert.equal(planSearchQuery("জীববিজ্ঞান পরীক্ষা ৪ ডিসেম্বর"), "জীববিজ্ঞান পরীক্ষা ডিসেম্বর");
  assert.equal(planSearchQuery("exam tomorrow"), "");
});

test("plan sessions link study sessions to their topic's source", () => {
  const topics = [
    { ...topic("A", 1), source: "src-A" },
    { ...topic("B", 1), source: null },
  ];
  const { sessions, tight } = buildPlanSessions(topics, { startDate: "2026-11-23", endDate: "2026-11-24", minutesPerDay: 45, weekdays: EVERY_DAY });
  assert.equal(tight, false);
  assert.deepEqual(sessions.map((session) => [session.title, session.source]), [
    ["A", "src-A"],
    ["B", null],
    ["Final review", null],
  ]);
});

test("a roomy plan spreads topics out, adds quick reviews and ends with review days", () => {
  const schedule = scheduleStudyPlan({
    topics: [topic("A"), topic("B"), topic("C")],
    startDate: "2026-11-23",
    endDate: "2026-12-02",
    weekdays: EVERY_DAY,
    minutesPerDay: 60,
  });
  assert.equal(schedule.studyDays, 10);
  assert.equal(schedule.tight, false);
  const study = schedule.sessions.filter((session) => session.kind === "study");
  assert.deepEqual(study.map((session) => session.title), ["A", "B", "C"]);
  assert.ok(study.every((session) => session.day < "2026-12-01"), "learning ends before the review days");
  // Two review days at the end (a fifth of 10), covering every topic in order.
  const finals = schedule.sessions.filter((session) => session.day >= "2026-12-01");
  assert.deepEqual(finals.map((session) => [session.day, session.kind, session.topics]), [
    ["2026-12-01", "review", [0]],
    ["2026-12-02", "review", [1, 2]],
  ]);
  assert.ok(schedule.sessions.some((session) => session.title.startsWith("Quick review")), "free days review the last topics");
  const days = schedule.sessions.map((session) => session.day);
  assert.deepEqual(days, [...days].sort(), "sessions are in date order");
});

test("a long topic is split into parts, no day holds more than the minutes per day, and no session is a sliver", () => {
  const schedule = scheduleStudyPlan({
    topics: [topic("A", 3), topic("B", 3), topic("C", 1), topic("D", 2), topic("E", 3)],
    startDate: "2026-11-23",
    endDate: "2026-12-20",
    weekdays: WEEKDAYS,
    minutesPerDay: 45,
  });
  const perDay = new Map<string, number>();
  for (const session of schedule.sessions) perDay.set(session.day, (perDay.get(session.day) ?? 0) + session.minutes);
  for (const [day, minutes] of perDay) assert.ok(minutes <= 45, `${day} has ${minutes} minutes`);
  assert.ok(schedule.sessions.every((session) => session.minutes >= MIN_SESSION_MINUTES));
  assert.deepEqual(
    schedule.sessions.filter((session) => session.title.startsWith("A")).map((session) => [session.title, session.minutes]),
    [["A (part 1 of 2)", 45], ["A (part 2 of 2)", 15]],
  );
  assert.ok(schedule.sessions.every((session) => {
    const weekday = new Date(`${session.day}T00:00:00Z`).getUTCDay();
    return weekday >= 1 && weekday <= 5;
  }), "only weekdays are used");
});

test("too little time shortens sessions and says the plan is tight, but keeps every topic", () => {
  const topics = Array.from({ length: 8 }, (_, index) => topic(`T${index + 1}`, 3));
  const schedule = scheduleStudyPlan({ topics, startDate: "2026-11-23", endDate: "2026-11-25", weekdays: EVERY_DAY, minutesPerDay: 30 });
  assert.equal(schedule.tight, true);
  const covered = new Set(schedule.sessions.filter((session) => session.kind === "study").flatMap((session) => session.topics));
  assert.equal(covered.size, 8);
  assert.equal(schedule.sessions.at(-1)?.title, "Final review");
  assert.equal(schedule.sessions.at(-1)?.day, "2026-11-25");
});

test("a topic that fits in a day is never split across two", () => {
  const schedule = scheduleStudyPlan({ topics: [topic("A", 1), topic("B", 2)], startDate: "2026-11-23", endDate: "2026-11-25", weekdays: EVERY_DAY, minutesPerDay: 45 });
  // B (40 minutes) does not fit in the 25 left on day one, so it moves to day two whole.
  assert.deepEqual(schedule.sessions.map((session) => [session.day, session.title, session.minutes]), [
    ["2026-11-23", "A", 20],
    ["2026-11-24", "B", 40],
    ["2026-11-25", "Final review", 45],
  ]);
});

test("a one-day plan is all learning, with no review day", () => {
  const schedule = scheduleStudyPlan({ topics: [topic("A", 1)], startDate: "2026-11-20", endDate: "2026-11-20", weekdays: EVERY_DAY, minutesPerDay: 30 });
  assert.deepEqual(schedule.sessions.map((session) => [session.day, session.kind, session.minutes]), [["2026-11-20", "study", 20]]);
});

test("a session becomes a planner task on its calendar day", () => {
  const task = planSessionTask({ day: "2026-11-24", kind: "review", title: "Final review", cover: "Go over it.", minutes: 45 }, "Biology exam", null);
  assert.deepEqual(task, {
    title: "Final review",
    description: "Go over it.",
    category: "Revision",
    dueDate: "2026-11-24T00:00:00.000Z",
    estimatedDuration: 45,
    notes: "Study plan: Biology exam",
  });
  const study = planSessionTask({ day: "2026-11-23", kind: "study", title: "Cells", cover: "", minutes: 30 }, "Exam", "Biology, p. 4");
  assert.equal(study.category, "Study");
  assert.equal(study.description, "From: Biology, p. 4");
  // The planner reads due dates with UTC getters, so this is the 24th everywhere.
  assert.equal(new Date(task.dueDate).getUTCDate(), 24);
});


test("the request schema checks the request, the day and optional settings", () => {
  const valid = { request: "Biology test on Dec 4", today: "2026-11-21" };
  const settings = { startDate: "2026-11-23", endDate: "2026-11-27", minutesPerDay: 45, weekdays: EVERY_DAY };
  assert.equal(studyPlanRequestSchema.safeParse(valid).success, true);
  assert.equal(studyPlanRequestSchema.safeParse({ ...valid, refs: ["note:n1"], settings }).success, true);
  assert.equal(studyPlanRequestSchema.safeParse({ ...valid, request: "  " }).success, false);
  assert.equal(studyPlanRequestSchema.safeParse({ ...valid, today: "2026-02-30" }).success, false);
  assert.equal(studyPlanRequestSchema.safeParse({ ...valid, refs: [] }).success, false);
  assert.equal(studyPlanRequestSchema.safeParse({ ...valid, settings: { ...settings, endDate: "2026-11-22" } }).success, false, "finish before start");
  assert.equal(studyPlanRequestSchema.safeParse({ ...valid, settings: { ...settings, endDate: "2027-03-01" } }).success, false, "more than 90 days");
  assert.equal(studyPlanRequestSchema.safeParse({ ...valid, settings: { ...settings, weekdays: [] } }).success, false);
  assert.equal(studyPlanRequestSchema.safeParse({ ...valid, settings: { ...settings, minutesPerDay: 5 } }).success, false);
  assert.equal(studyPlanRequestSchema.safeParse({ ...valid, extra: 1 }).success, false);
});

function setup(options: { reply?: string; failModel?: boolean; allowed?: boolean; found?: string[] } = {}) {
  const sources: Record<string, LoadedStudySource> = {
    asset1: {
      kind: "pdf",
      id: "asset1",
      title: "Biology",
      itemId: "item1",
      passages: [
        { anchor: "page1", heading: "Page 1", content: "Cells are the unit of life." },
        { anchor: "page4", heading: "Page 4", content: "Mitosis makes two identical cells." },
      ],
    },
    note1: { kind: "note", id: "note1", title: "My notes", itemId: null, passages: [{ anchor: "b1", heading: "", content: "Meiosis makes gametes." }] },
    empty: { kind: "note", id: "empty", title: "Empty", itemId: null, passages: [] },
  };
  const calls = { consumed: 0, refunded: 0, prompts: [] as string[], searches: [] as string[] };
  const deps: StudyDeps = {
    dailyLimit: 25,
    now: () => new Date("2026-11-21T10:00:00Z"),
    consumeQuestion: async () => {
      calls.consumed += 1;
      return { allowed: options.allowed ?? true, used: 3 };
    },
    getUsedCount: async () => 3,
    refundQuestion: async () => {
      calls.refunded += 1;
    },
    findSources: async (userId, query) => {
      calls.searches.push(query);
      return userId === "u1" ? (options.found ?? ["asset1", "note1"]).map((id) => ({ type: id === "asset1" ? ("asset" as const) : ("note" as const), id })) : [];
    },
    loadSource: async (userId, ref) => (userId === "u1" ? sources[ref.id] ?? null : null),
    complete: async (messages) => {
      calls.prompts.push(messages.map((m) => m.content).join("\n"));
      if (options.failModel) throw Object.assign(new Error("busy"), { status: 503 });
      return { text: options.reply ?? "[]", provider: "groq-large", model: "test" };
    },
    replaceAiCards: async () => ({ created: 0, replaced: 0 }),
  };
  return { service: createStudyService(deps), calls };
}

const reply = JSON.stringify({
  goal: "Biology test",
  finish: "2026-12-03",
  minutesPerDay: 60,
  days: ["mon", "tue", "wed", "thu", "fri"],
  topics: [
    { title: "Cells", cover: "What cells are.", effort: 1, passage: 1 },
    { title: "Mitosis", cover: "How cells divide.", effort: 2, passage: 2 },
    { title: "Meiosis", cover: "How gametes form.", effort: 2, passage: 3 },
  ],
});
const request = { request: "Biology test on Dec 4, an hour on weekdays", today: "2026-11-21" };

test("one sentence finds the material, reads the settings and links topics to their pages, for one question", async () => {
  const { service, calls } = setup({ reply });
  const plan = await service.makePlan("u1", request);
  assert.deepEqual(calls.searches, ["Biology"]);
  assert.equal(calls.consumed, 1);
  assert.equal(calls.refunded, 0);
  assert.match(calls.prompts[0], /Today is Saturday, 2026-11-21/);
  assert.match(calls.prompts[0], /"Biology", "My notes"/);
  assert.equal(plan.goal, "Biology test");
  assert.deepEqual(plan.settings, { startDate: "2026-11-21", endDate: "2026-12-03", minutesPerDay: 60, weekdays: [1, 2, 3, 4, 5] });
  assert.deepEqual(plan.sources, [
    { ref: "asset:asset1", kind: "pdf", title: "Biology" },
    { ref: "note:note1", kind: "note", title: "My notes" },
  ]);
  assert.deepEqual(plan.topics.map((topic) => [topic.title, topic.source?.label, topic.source?.ref]), [
    ["Cells", "Biology, p. 1", "asset:asset1#page1"],
    ["Mitosis", "Biology, p. 4", "asset:asset1#page4"],
    ["Meiosis", "My notes", "note:note1#b1"],
  ]);
});

test("a found source Rangan made no topic from is left out of the plan", async () => {
  const onlyBiology = JSON.stringify({ goal: "Biology test", topics: [{ title: "Cells", effort: 1, passage: 1 }, { title: "Mitosis", effort: 2, passage: 2 }] });
  const { service, calls } = setup({ reply: onlyBiology });
  const plan = await service.makePlan("u1", request);
  assert.match(calls.prompts[0], /Skip passages that are not about it/);
  assert.deepEqual(plan.sources.map((source) => source.ref), ["asset:asset1"]);
});

test("chosen sources and settings are used as given, without a search", async () => {
  const { service, calls } = setup({ reply });
  const settings = { startDate: "2026-11-23", endDate: "2026-11-27", minutesPerDay: 30, weekdays: EVERY_DAY };
  const plan = await service.makePlan("u1", { ...request, refs: ["note:note1"], settings });
  assert.deepEqual(calls.searches, []);
  assert.deepEqual(plan.settings, settings);
  assert.deepEqual(plan.sources.map((source) => source.ref), ["note:note1"]);
});

test("no matching material, a missing source, an empty range or a bad ref costs no question", async () => {
  const { service, calls } = setup({ reply, found: [] });
  await assert.rejects(service.makePlan("u1", request), { status: 404, details: { needSources: true } });
  await assert.rejects(service.makePlan("u1", { ...request, refs: ["asset:nope"] }), { status: 404 });
  await assert.rejects(service.makePlan("other", { ...request, refs: ["asset:asset1"] }), { status: 404 });
  await assert.rejects(service.makePlan("u1", { ...request, refs: ["item:x"] }), { status: 400 });
  await assert.rejects(
    service.makePlan("u1", { ...request, refs: ["asset:asset1"], settings: { startDate: "2026-11-21", endDate: "2026-11-22", minutesPerDay: 45, weekdays: WEEKDAYS } }),
    { status: 400 },
  );
  assert.equal(calls.consumed, 0);
  const empty = setup({ reply, found: ["empty"] });
  await assert.rejects(empty.service.makePlan("u1", request), { status: 404 });
  assert.equal(empty.calls.consumed, 0);
});

test("a library with nothing on the subject is said plainly, not as a failure, and costs nothing", async () => {
  // The model read the material and found nothing about the request: no topics.
  const nothing = JSON.stringify({ goal: "Data structures exam", finish: null, minutesPerDay: null, days: null, topics: [] });
  const found = setup({ reply: nothing });
  await assert.rejects(found.service.makePlan("u1", { request: "plan data structures for my exam next week", today: "2026-11-22" }), (error: { status?: number; details?: { needSources?: boolean }; message?: string }) => {
    assert.equal(error.status, 404, "not a server failure, so the screen never says Rangan is busy");
    assert.equal(error.details?.needSources, true);
    assert.match(error.message ?? "", /library doesn't have material on that/);
    return true;
  });
  assert.deepEqual([found.calls.consumed, found.calls.refunded], [1, 1], "the question is given back");

  // Chosen material that doesn't cover the request asks for other material.
  const chosen = setup({ reply: nothing });
  await assert.rejects(chosen.service.makePlan("u1", { request: "plan data structures", today: "2026-11-22", refs: ["note:note1"] }), { status: 422 });
  assert.deepEqual([chosen.calls.consumed, chosen.calls.refunded], [1, 1]);
});

test("an unusable reply or a model failure gives the question back", async () => {
  const unusable = setup({ reply: "sorry" });
  await assert.rejects(unusable.service.makePlan("u1", request), { status: 502 });
  assert.deepEqual([unusable.calls.consumed, unusable.calls.refunded], [1, 1]);

  const failing = setup({ failModel: true });
  await assert.rejects(failing.service.makePlan("u1", request), { status: 503 });
  assert.deepEqual([failing.calls.consumed, failing.calls.refunded], [1, 1]);
});

test("a spent allowance is refused before the model is asked", async () => {
  const { service, calls } = setup({ reply, allowed: false });
  await assert.rejects(service.makePlan("u1", request), { status: 429 });
  assert.equal(calls.prompts.length, 0);
});

test("a chat message asks for a plan only when it names one or opens by asking for one", () => {
  for (const message of [
    "Plan my biology test for Dec 4",
    "plan my revision for the next two weeks",
    "Make me a study plan for chemistry",
    "Can you help me plan for my physics exam on Friday?",
    "create a revision timetable for finals",
    "I need a study schedule for the history test",
    "Could you make a schedule for my biology exam?",
    "Schedule my reading for this week",
    "i want to plan this for my exam on friday",
    "help me study this before my exam next week",
    "I need to revise these notes by Sunday",
  ]) {
    assert.equal(isPlanRequest(message), true, message);
  }
  for (const message of [
    "What is a business plan?",
    "Explain the Schlieffen plan",
    "Summarize my notes on project planning",
    "What did I write about the five-year plan?",
    "Make flashcards about mitosis",
    "planets in the solar system",
    "What should I study before my exam?",
    "how do I prepare for interviews",
    "make flashcards to revise for my test",
    "",
  ]) {
    assert.equal(isPlanRequest(message), false, message);
  }
});

test("a plan studies from the best match, plus others only when they match by keyword and meaning", () => {
  const result = (sourceType: string, sourceId: string, ...matchedBy: string[]) => ({ sourceType, sourceId, matchedBy });
  assert.deepEqual(
    pickPlanSources([
      result("note", "cells", "meaning"),
      result("note", "cells", "keyword", "meaning"),
      result("pdf", "vocabulary", "keyword"),
      result("item", "article", "keyword", "meaning"),
      result("pdf", "osmosis", "keyword", "meaning"),
      result("transcript", "lecture", "meaning", "keyword"),
      result("note", "extra", "keyword", "meaning"),
    ]),
    [
      { type: "note", id: "cells" },
      { type: "asset", id: "osmosis" },
      { type: "asset", id: "lecture" },
    ],
  );
  assert.deepEqual(pickPlanSources([result("pdf", "only", "keyword")]), [{ type: "asset", id: "only" }], "the best match is always used");
  assert.deepEqual(pickPlanSources([]), []);
});

test("a plan about \"this\" means what is open", () => {
  for (const message of ["create a study plan for this page", "plan these notes for Friday", "help me finish it by Sunday", "plan the current chapter"]) {
    assert.equal(refersToOpen(message), true, message);
  }
  for (const message of ["plan my biology test for Dec 4", "make me a study plan for chemistry", "Schedule my reading for this week", "revise for my exam these days"]) {
    assert.equal(refersToOpen(message), false, message);
  }
});
