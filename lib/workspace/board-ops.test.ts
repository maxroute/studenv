import assert from "node:assert/strict";
import test from "node:test";
import type { StudioItem } from "@/types/workspace";
import { WorkspaceNodeSchema } from "@/types/workspace";
import { applyBoardOps, boardToolsInstruction, describeBoardOp, layoutBoxes, parseBoardOps, type BoardCard, asksForBoard } from "./board-ops";
import { boardSummary } from "./board-edit";

const sticky = (id: string, text: string, x: number, y: number, extra: Record<string, unknown> = {}): StudioItem => ({
  id,
  type: "sticky",
  x,
  y,
  w: 220,
  h: 120,
  rotation: 0,
  zIndex: 1,
  props: { text, color: "#CDEBDD", ...extra },
});
const board: StudioItem[] = [
  sticky("s1", "Deadlock", 0, 0),
  sticky("s2", "Mutual exclusion", 400, 0),
  sticky("s3", "Hold and wait", 800, 0),
  sticky("s4", "Locked note", 0, 400, { locked: true }),
  { id: "c1", type: "connector", x: 0, y: 0, w: 1, h: 1, rotation: 0, zIndex: 0, props: { source: { id: "s1" }, target: { id: "s2" }, mode: "curve", color: "#8a8a8a", strokeWidth: 2, strokeStyle: "solid", frontEndpointStyle: "none", rearEndpointStyle: "arrow" } },
];
const summary = boardSummary(board, ["s2"]);
const key = (id: string) => summary.elements.find((element) => element.id === id)?.key ?? "";
let counter = 0;
const newId = () => `new-${++counter}`;
const run = (ops: unknown[], cards?: ReadonlyMap<string, BoardCard>) => {
  const plan = parseBoardOps({ summary: "x", ops }, summary, cards);
  assert.ok(plan, "the steps are kept");
  const result = applyBoardOps(board, plan.ops, summary, { newId, viewportCentre: { x: 0, y: 0 } });
  assert.ok(result);
  // Everything on the board after the steps is a valid board element.
  for (const item of result.items) assert.ok(WorkspaceNodeSchema.safeParse(item).success, `${item.type} ${item.id} is valid`);
  return { plan, result, byId: (id: string) => result.items.find((item) => item.id === id) };
};

test("the instruction lists elements with style and selection, and every tool", () => {
  const styles = new Map(board.filter((item) => item.type === "sticky").map((item) => [key(item.id), item.id === "s4" ? "green, locked" : "green"]));
  const text = boardToolsInstruction("tidy this up", "OS", summary, styles, [{ ref: "note:n1", title: "Deadlocks" }]);
  assert.match(text, new RegExp(`${key("s2")}\\* \\(sticky, green\\) Mutual exclusion`));
  assert.match(text, /green, locked\) Locked note/);
  for (const tool of ["add", "card", "connect", "disconnect", "edit", "move", "arrange", "align", "delete", "group", "ungroup", "lock", "order", "frame", "tips"]) {
    assert.match(text, new RegExp(`"op": "${tool}"`), tool);
  }
  assert.match(text, /note:n1 "Deadlocks"/);
});

test("new elements are placed by relation, joined, and can be used by later steps as n1, n2", () => {
  const { result, byId } = run([
    { op: "add", what: "sticky", text: "Circular wait\nA cycle of waits", color: "pink", link: { to: key("s1"), label: "condition" } },
    { op: "add", what: "shape", shape: "diamond", text: "Deadlock?", color: "blue", place: { near: "n1", side: "below" } },
    { op: "connect", from: "n1", to: "n2", label: "check" },
  ]);
  const added = result.items.filter((item) => item.id.startsWith("new-"));
  const newSticky = added.find((item) => item.type === "sticky");
  const shape = added.find((item) => item.type === "shape");
  assert.ok(newSticky && shape);
  assert.equal(newSticky.type === "sticky" && newSticky.props.color, "#F6D7DE");
  assert.ok(shape.y > newSticky.y + newSticky.h, "the shape is below the sticky");
  const connectors = added.filter((item) => item.type === "connector");
  assert.equal(connectors.length, 2, "one from the link, one from connect");
  assert.ok(connectors.some((item) => item.type === "connector" && item.props.source.id === "s1" && item.props.target.id === newSticky.id && item.props.label?.text === "condition"));
  assert.ok(connectors.some((item) => item.type === "connector" && item.props.source.id === newSticky.id && item.props.target.id === shape.id));
  assert.ok(added.some((item) => item.type === "text" && item.props.text === "Deadlock?"), "a shape's words sit beside it as text");
  assert.equal(byId("s1")?.x, 0, "existing elements stay where they are");
});

test("edits, moves, arrange, align, delete, group, lock and order use the board's own rules", () => {
  const { result, byId } = run([
    { op: "edit", key: key("s2"), text: "Mutual exclusion\nOne at a time", color: "yellow", scale: 1.5 },
    { op: "move", key: key("s3"), near: key("s1"), side: "below" },
    { op: "align", keys: [key("s1"), key("s2")], edge: "top" },
    { op: "group", keys: [key("s1"), key("s2")] },
    { op: "edit", key: key("s4"), text: "changed" },
    { op: "delete", keys: [key("s4")] },
    { op: "order", keys: [key("s1")], to: "front" },
  ]);
  const s2 = byId("s2");
  assert.ok(s2?.type === "sticky");
  assert.equal(s2.props.text, "Mutual exclusion\nOne at a time");
  assert.equal(s2.props.color, "#F8E7A1");
  assert.equal(s2.w, 330);
  const s3 = byId("s3");
  assert.ok(s3 && s3.y > 120, "moved below");
  assert.equal((byId("s1")?.props as { groupId?: string }).groupId, (byId("s2")?.props as { groupId?: string }).groupId);
  assert.ok((byId("s1")?.props as { groupId?: string }).groupId);
  assert.ok(byId("s4"), "a locked element is neither edited nor deleted");
  assert.equal(byId("s1")?.zIndex, Math.max(...result.items.map((item) => item.zIndex)));
});

test("locked elements are refused at parse time except to unlock; unlocking first makes them editable", () => {
  const refused = parseBoardOps({ ops: [{ op: "edit", key: key("s4"), text: "x" }, { op: "move", key: key("s4"), near: key("s1") }] }, summary);
  assert.equal(refused, null);
  const { byId } = run([
    { op: "lock", keys: [key("s4")], locked: false },
    { op: "edit", key: key("s4"), text: "Now editable" },
  ]);
  const s4 = byId("s4");
  assert.ok(s4?.type === "sticky");
  assert.equal(s4.props.text, "Now editable");
  assert.equal(s4.props.locked, false);
});

test("deleting removes the element's connectors; disconnect removes only the connection", () => {
  const deleted = run([{ op: "delete", keys: [key("s2")] }]);
  assert.equal(deleted.byId("s2"), undefined);
  assert.equal(deleted.byId("c1"), undefined);
  const cut = run([{ op: "disconnect", from: key("s2"), to: key("s1") }]);
  assert.ok(cut.byId("s2"));
  assert.equal(cut.byId("c1"), undefined);
});

test("layouts: rows, columns, grids, circles and trees by connection", () => {
  const boxes = [{ w: 100, h: 50 }, { w: 100, h: 50 }, { w: 100, h: 50 }, { w: 100, h: 50 }];
  assert.deepEqual(layoutBoxes(boxes, "row", { x: 0, y: 0 }).map((p) => p.x), [0, 140, 280, 420]);
  assert.deepEqual(layoutBoxes(boxes, "column", { x: 0, y: 0 }).map((p) => p.y), [0, 80, 160, 240]);
  const grid = layoutBoxes(boxes, "grid", { x: 0, y: 0 });
  assert.deepEqual(grid.map((p) => [p.x, p.y]), [[0, 0], [140, 0], [0, 90], [140, 90]]);
  const tree = layoutBoxes(boxes, "tree", { x: 0, y: 0 }, [[0, 1], [0, 2], [1, 3]]);
  assert.ok(tree[1].y > tree[0].y && tree[2].y === tree[1].y && tree[3].y > tree[1].y, "levels go down by connection");
  const circle = layoutBoxes(boxes, "circle", { x: 0, y: 0 });
  assert.equal(new Set(circle.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).size, 4);
});

test("a timeline arranges in order and joins neighbours with arrows; a frame goes behind with its title", () => {
  const { result } = run([
    { op: "arrange", keys: [key("s1"), key("s2"), key("s3")], layout: "timeline" },
    { op: "frame", keys: [key("s1"), key("s2"), key("s3")], label: "Coffman conditions" },
  ]);
  const arrows = result.items.filter((item) => item.type === "connector" && item.id.startsWith("new-"));
  assert.equal(arrows.length, 1, "s1 -> s2 already existed; only s2 -> s3 is new");
  const frame = result.items.find((item) => item.type === "shape" && item.id.startsWith("new-"));
  assert.ok(frame && frame.zIndex < Math.min(...board.map((item) => item.zIndex)), "the frame sits behind everything");
  assert.ok(result.items.some((item) => item.type === "free-text" && item.props.text === "Coffman conditions"));
});

test("library cards come only from the server's checked list", () => {
  const cards = new Map<string, BoardCard>([["note:n1", { type: "note-card", noteId: "n1", title: "Deadlocks", excerpt: "A set of processes…" }]]);
  const { result } = run([{ op: "card", ref: "note:n1", link: { to: key("s1"), label: "notes" } }, { op: "card", ref: "note:unknown" }], cards);
  const card = result.items.find((item) => item.type === "note-card");
  assert.ok(card?.type === "note-card" && card.props.noteId === "n1");
  assert.equal(result.items.filter((item) => item.type === "note-card").length, 1);
});

test("nothing usable is no plan; steps read in plain words", () => {
  assert.equal(parseBoardOps({ ops: [{ op: "edit", key: "e99", text: "x" }, { op: "fly" }] }, summary), null);
  const plan = parseBoardOps({ ops: [{ op: "arrange", keys: [key("s1"), key("s2")], layout: "grid" }, { op: "add", what: "sticky", text: "Hi", color: "green", link: { to: key("s1") } }] }, summary);
  assert.ok(plan);
  assert.deepEqual(plan.ops.map((op) => describeBoardOp(op, summary)), ["Arrange “Deadlock”, “Mutual exclusion” as a grid", "Add a green sticky “Hi”, joined to “Deadlock”"]);
});

import { asksForNewBoard, looksLikeBoardEdit } from "./board-ops";

test("with a board open, change words mean this board; a new map means a new board", () => {
  for (const message of [
    "make the four exam tip stickies blue, arrange them as a grid, frame them as Exam tips, and add a green diamond shape",
    "tidy this up",
    "connect memory to paging",
    "add some stickies about paging",
    "delete the empty ones",
  ]) {
    assert.equal(looksLikeBoardEdit(message, false), true, message);
    assert.equal(asksForNewBoard(message), false, message);
  }
  assert.equal(looksLikeBoardEdit("explain this", true), true, "a selection points at the board");
  assert.equal(asksForNewBoard("make a mind map of photosynthesis"), true);
  assert.equal(asksForNewBoard("create a new board for networking"), true);
  assert.equal(looksLikeBoardEdit("remind me to revise this at 6", true), false);
});

test("a heading or text named in other words is still a heading or text", () => {
  const plan = parseBoardOps({ ops: [
    { op: "add", what: "title", text: "Deadlock revision" },
    { op: "add", what: "free-text", text: "A label" },
    { op: "add", what: "Header", text: "Big" },
    { op: "add", what: "note", text: "A sticky" },
  ] }, summary);
  assert.deepEqual(plan?.ops.map((op) => (op.op === "add" ? op.what : op.op)), ["heading", "text", "heading", "sticky"]);
});

test("asking for a whiteboard, diagram, flowchart or roadmap is a board request", () => {
  for (const message of ["Create the board", "make a whiteboard on JWT", "draw a flowchart of the login flow", "Now create a full diagram on the board explaining all these", "build a roadmap to finish this topic"]) {
    assert.equal(asksForBoard(message), true, message);
  }
  const long = "create a new note on operating systems and also take it to the board too so that i can visualize it for my revision and my exam next week, with every topic";
  for (const message of ["Where is the board?", "what is a flowchart", "add a task to make a diagram", "create a page on trees", long]) {
    assert.equal(asksForBoard(message), false, message);
  }
});
