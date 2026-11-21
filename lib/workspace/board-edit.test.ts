import assert from "node:assert/strict";
import test from "node:test";
import { WORKSPACE_SCENE_FORMAT, WORKSPACE_SCENE_VERSION, WorkspaceSceneSchema, type StudioItem } from "@/types/workspace";
import { applyBoardPlan, boardEditInstruction, boardSummary, describeBoardChange, parseBoardPlan, placeNear } from "./board-edit";

let counter = 0;
const newId = () => `n${counter++}`;

const sticky = (id: string, x: number, y: number, text: string, extra: Record<string, unknown> = {}): StudioItem =>
  ({ id, type: "sticky", x, y, w: 220, h: 120, rotation: 0, zIndex: 5, props: { text, color: "#D6E8F8", ...extra } }) as StudioItem;
const BOARD: StudioItem[] = [
  sticky("centre", 0, 0, "Operating System"),
  sticky("proc", 400, 0, "Processes\nPrograms that run"),
  sticky("mem", 400, 200, "Memory"),
  sticky("pinned", -400, 0, "My own note", { locked: true }),
  { id: "c1", type: "connector", x: 0, y: 0, w: 1, h: 1, rotation: 0, zIndex: 2, props: { source: { id: "centre" }, target: { id: "proc" }, mode: "curve", color: "#888", strokeWidth: 2, strokeStyle: "solid", frontEndpointStyle: "none", rearEndpointStyle: "arrow", label: { text: "runs", offset: 0.5 } } },
];

test("the board is described by short keys, selected elements first, with its connections", () => {
  const summary = boardSummary(BOARD, ["mem"]);
  assert.deepEqual(summary.elements.map((e) => [e.key, e.id, e.selected, e.locked]), [
    ["e1", "mem", true, false],
    ["e2", "centre", false, false],
    ["e3", "proc", false, false],
    ["e4", "pinned", false, true],
  ]);
  assert.deepEqual(summary.edges, [{ from: "e2", to: "e3", label: "runs" }]);
  const text = boardEditInstruction("expand the selected node", "OS map", summary);
  assert.match(text, /e1\* \(sticky\) Memory/);
  assert.match(text, /e2 -> e3 "runs"/);
  assert.match(text, /You can only add/);
});

test("a plan keeps only changes that point at elements on the board", () => {
  const summary = boardSummary(BOARD, ["mem"]);
  const plan = parseBoardPlan(
    {
      summary: "Expanded Memory.",
      changes: [
        { add: { to: "e1", title: "Paging [1]", note: "Fixed-size blocks", label: "uses", children: [{ title: "Page table" }, { title: "" }], also: [{ to: "e3", label: "feeds" }, { to: "e9" }, { to: "e1" }] } },
        { add: { to: "e9", title: "Nowhere" } },
        { add: { to: null, title: "Loose idea" } },
        { connect: { from: "e3", to: "e1", label: "needs" } },
        { connect: { from: "e3", to: "e3" } },
        { tips: ["Exam tip: Know paging vs segmentation", ""] },
        { group: ["e1", "e9"] },
        { group: ["e1", "e3", "e4"] },
        { remove: ["e2"] },
      ],
    },
    summary,
  );
  assert.ok(plan);
  assert.deepEqual(plan.changes, [
    { kind: "add", to: "e1", node: { title: "Paging", note: "Fixed-size blocks" }, label: "uses", children: [{ title: "Page table", note: "" }], also: [{ to: "e3", label: "feeds" }] },
    { kind: "add", to: null, node: { title: "Loose idea", note: "" }, label: "", children: [], also: [] },
    { kind: "connect", from: "e3", to: "e1", label: "needs" },
    { kind: "tips", tips: ["Know paging vs segmentation"] },
    { kind: "group", keys: ["e1", "e3", "e4"] },
  ]);
  assert.equal(describeBoardChange(plan.changes[0], summary), "Add “Paging” joined to “Memory” (uses), with Page table, linked to “Processes Programs that run” (feeds)");
  assert.equal(parseBoardPlan({ changes: [{ remove: ["e1"] }] }, summary), null);
  assert.equal(parseBoardPlan(null, summary), null);
});

const solid = (items: StudioItem[]) => items.filter((item) => item.type !== "connector");
const overlap = (a: StudioItem, b: StudioItem) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("applying adds stickies in free space, joined by connectors, and keeps everything else as it was", () => {
  const summary = boardSummary(BOARD, ["mem"]);
  const plan = parseBoardPlan(
    { changes: [{ add: { to: "e1", title: "Paging", label: "uses", children: [{ title: "Page table" }, { title: "TLB" }], also: [{ to: "e3", label: "feeds" }] } }, { connect: { from: "e3", to: "e1", label: "needs" } }, { tips: ["Know paging"] }, { group: ["e2", "e4"] }] },
    summary,
  );
  assert.ok(plan);
  const result = applyBoardPlan(BOARD, plan.changes, summary, { newId, viewportCentre: { x: 0, y: 0 } });
  assert.ok(result);
  const scene = WorkspaceSceneSchema.safeParse({ format: WORKSPACE_SCENE_FORMAT, version: WORKSPACE_SCENE_VERSION, items: result.items, workspaceAssetIds: [], viewport: { x: 0, y: 0, zoom: 1 } });
  assert.ok(scene.success);
  // Existing elements: same place, same text; only grouping changes, and never on a locked one.
  for (const original of BOARD) {
    const current: StudioItem | undefined = result.items.find((item) => item.id === original.id);
    assert.ok(current);
    assert.deepEqual([current.x, current.y, current.w, current.h, current.zIndex], [original.x, original.y, original.w, original.h, original.zIndex]);
  }
  const groupOf = (id: string) => (result.items.find((item) => item.id === id)?.props as { groupId?: string }).groupId;
  assert.ok(groupOf("centre"));
  assert.equal(groupOf("pinned"), undefined, "a locked element isn't regrouped");
  // New elements: 4 stickies (Paging, 2 children, 1 tip) and 5 connectors (uses, feeds, 2 children, needs).
  const added = result.items.filter((item) => result.addedIds.includes(item.id));
  assert.equal(added.filter((item) => item.type === "sticky").length, 4);
  assert.equal(added.filter((item) => item.type === "connector").length, 5);
  const nodes = solid(result.items);
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) assert.equal(overlap(nodes[i], nodes[j]), false, `${nodes[i].id} overlaps ${nodes[j].id}`);
  }
  assert.ok(added.every((item) => item.zIndex > 5), "new elements go on top");
});

test("a plan whose element was deleted meanwhile isn't applied", () => {
  const summary = boardSummary(BOARD, []);
  const plan = parseBoardPlan({ changes: [{ connect: { from: "e1", to: "e2", label: "x" } }] }, summary);
  assert.ok(plan);
  const without = BOARD.filter((item) => item.id !== "centre");
  assert.equal(applyBoardPlan(without, plan.changes, summary, { newId, viewportCentre: { x: 0, y: 0 } }), null);
});

test("free space is found beside the anchor, stepping out past anything in the way", () => {
  const anchor = { x: 0, y: 0, w: 200, h: 100 };
  assert.deepEqual(placeNear(anchor, { w: 100, h: 100 }, []), { x: 320, y: 0, w: 100, h: 100 });
  const blockRight = { x: 300, y: -50, w: 300, h: 200 };
  const spot = placeNear(anchor, { w: 100, h: 100 }, [blockRight]);
  assert.deepEqual(spot, { x: 50, y: 220, w: 100, h: 100 }, "below when the right is taken");
});

test("a new sticky and its sub-notes are placed together as one block beside what they join", () => {
  const summary = boardSummary(BOARD, []);
  const plan = parseBoardPlan({ changes: [{ add: { to: "e3", title: "Scheduling", children: [{ title: "FCFS" }, { title: "Round robin" }, { title: "Priority" }] } }] }, summary);
  assert.ok(plan);
  const result = applyBoardPlan(BOARD, plan.changes, summary, { newId, viewportCentre: { x: 0, y: 0 } });
  assert.ok(result);
  const added = result.items.filter((item) => result.addedIds.includes(item.id) && item.type === "sticky");
  const parent = added.find((item) => item.type === "sticky" && item.props.text === "Scheduling");
  const children = added.filter((item) => item !== parent);
  assert.ok(parent);
  assert.equal(new Set(children.map((child) => child.x)).size, 1, "the sub-notes form one column");
  assert.ok(children.every((child) => child.x > parent.x), "beside the new sticky");
  const ys = children.map((child) => child.y);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b), "in order, top to bottom");
  assert.ok(Math.max(...ys) - Math.min(...ys) < 400, "close together");
});
