import assert from "node:assert/strict";
import test from "node:test";
import { WORKSPACE_SCENE_FORMAT, WORKSPACE_SCENE_VERSION, WorkspaceSceneSchema, type StudioItem } from "@/types/workspace";
import { layoutMap, mapElementCount, mapInstruction, mapOutline, parseMapReply, stickyText, type MapDraft, type MapSourceCard } from "./mind-map";

let counter = 0;
const newId = () => `m${counter++}`;

const REPLY = {
  title: "Operating systems map",
  centre: "Operating System",
  branches: [
    { title: "Processes", note: "Programs that are running [1]", relation: "runs", passage: 1, children: [{ title: "Scheduling", note: "Who gets the CPU" }, { title: "Threads" }, { title: "processes" }] },
    { title: "Memory", note: "Where data lives", relation: "manages", passage: 9, children: [{ title: "Paging" }, { title: "Virtual memory" }] },
    { title: "Files", relation: "organizes", passage: "2", children: [{ title: "Directories" }] },
    { title: "Devices", children: [] },
    { title: "Security", children: [{ title: "Permissions" }] },
    { title: "", note: "no title" },
    { title: "memory", note: "duplicate" },
  ],
  links: [
    { from: "Scheduling", to: "Paging", label: "competes with" },
    { from: "Scheduling", to: "Nowhere", label: "x" },
    { from: "Files", to: "files", label: "self" },
  ],
  tips: ["Learn the layers [2]", "", "Draw the process states"],
};

test("the map instruction asks for the shape the parser reads", () => {
  const text = mapInstruction("make a mind map of operating systems", "operating systems");
  for (const part of ['"centre"', '"branches"', '"relation"', '"children"', '"links"', '"tips"', "passage"]) assert.ok(text.includes(part), part);
});

test("a reply becomes a clean map: distinct titles, valid links and sources, no citation marks", () => {
  const draft = parseMapReply(REPLY, 3);
  assert.ok(draft);
  assert.equal(draft.centre, "Operating System");
  assert.deepEqual(draft.branches.map((b) => [b.title, b.note, b.relation, b.source, b.children.map((c) => c.title)]), [
    ["Processes", "Programs that are running", "runs", 1, ["Scheduling", "Threads"]],
    ["Memory", "Where data lives", "manages", null, ["Paging", "Virtual memory"]],
    ["Files", "", "organizes", 2, ["Directories"]],
    ["Devices", "", "", null, []],
    ["Security", "", "", null, ["Permissions"]],
  ]);
  assert.deepEqual(draft.links, [{ from: "Scheduling", to: "Paging", label: "competes with" }]);
  assert.deepEqual(draft.tips, ["Learn the layers", "Draw the process states"]);
  assert.deepEqual(mapOutline(draft).slice(0, 3), ["Processes (runs)", "  Scheduling", "  Threads"]);
  assert.equal(stickyText({ title: "A", note: "" }), "A");
});

test("a reply without a centre or with fewer than two branches is not a map", () => {
  assert.equal(parseMapReply(null, 0), null);
  assert.equal(parseMapReply({ branches: REPLY.branches }, 0), null);
  assert.equal(parseMapReply({ centre: "OS", branches: [{ title: "Only one" }] }, 0), null);
});

const boxes = (items: StudioItem[]) => items.filter((item) => item.type !== "connector" && item.type !== "free-text");
const overlap = (a: StudioItem, b: StudioItem) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("the laid-out map is a valid board scene with no overlapping nodes", () => {
  const draft = parseMapReply(REPLY, 3) as MapDraft;
  const sources = new Map<number, MapSourceCard>([
    [1, { kind: "note", noteId: "note1", title: "CS notes", excerpt: "Processes run programs.", blockId: "b_AAAAAAAAAA" }],
    [2, { kind: "asset", assetId: "asset1", assetKind: "pdf", title: "Textbook" }],
  ]);
  const items = layoutMap(draft, { sources, page: { noteId: "page1", title: "Operating systems", excerpt: "A study page." }, newId });
  const scene = WorkspaceSceneSchema.safeParse({ format: WORKSPACE_SCENE_FORMAT, version: WORKSPACE_SCENE_VERSION, items, workspaceAssetIds: [], viewport: { x: 0, y: 0, zoom: 1 } });
  assert.ok(scene.success, scene.success ? "" : JSON.stringify(scene.error.issues.slice(0, 3)));
  assert.equal(items.length, mapElementCount(draft, sources) + 2, "count, plus the page card and its connector");

  const solid = boxes(items);
  for (let i = 0; i < solid.length; i += 1) {
    for (let j = i + 1; j < solid.length; j += 1) assert.equal(overlap(solid[i], solid[j]), false, `${solid[i].type} ${solid[i].id} overlaps ${solid[j].type} ${solid[j].id}`);
  }
  assert.equal(new Set(items.map((item) => item.id)).size, items.length, "ids are unique");
  assert.deepEqual(new Set(items.map((item) => item.zIndex)).size, items.length, "every element has its own layer");
});

test("connectors join the right stickies, sit underneath them, and carry the relation labels", () => {
  const draft = parseMapReply(REPLY, 3) as MapDraft;
  const items = layoutMap(draft, { newId });
  const byId = new Map(items.map((item) => [item.id, item]));
  const textOf = (id: string | undefined) => {
    const item = id ? byId.get(id) : undefined;
    return item && item.type === "sticky" ? item.props.text.split("\n")[0] : "?";
  };
  const connectors = items.filter((item): item is Extract<StudioItem, { type: "connector" }> => item.type === "connector");
  const labelled = connectors.filter((c) => c.props.label).map((c) => [textOf(c.props.source.id), c.props.label?.text, textOf(c.props.target.id)]);
  assert.deepEqual(labelled, [
    ["Operating System", "runs", "Processes"],
    ["Operating System", "manages", "Memory"],
    ["Operating System", "organizes", "Files"],
    ["Scheduling", "competes with", "Paging"],
  ]);
  const maxConnectorZ = Math.max(...connectors.map((c) => c.zIndex));
  assert.ok(boxes(items).every((node) => node.zIndex > maxConnectorZ));
});

test("each branch and its sub-nodes share a group; the centre and tips are ungrouped", () => {
  const draft = parseMapReply(REPLY, 3) as MapDraft;
  const items = layoutMap(draft, { newId });
  const stickies = items.filter((item): item is Extract<StudioItem, { type: "sticky" }> => item.type === "sticky");
  const groupOf = (title: string) => stickies.find((s) => s.props.text.startsWith(title))?.props.groupId;
  assert.ok(groupOf("Processes"));
  assert.equal(groupOf("Scheduling"), groupOf("Processes"));
  assert.notEqual(groupOf("Memory"), groupOf("Processes"));
  assert.equal(groupOf("Operating System"), undefined);
  assert.equal(groupOf("Exam tip"), undefined);
});

test("branches go right first, then left; the map is centred on the origin given", () => {
  const draft = parseMapReply(REPLY, 3) as MapDraft;
  const items = layoutMap(draft, { newId, origin: { x: 5000, y: 2000 }, zIndexBase: 100 });
  const centre = items.find((item) => item.type === "sticky" && item.props.text === "Operating System");
  assert.ok(centre);
  assert.equal(centre.x + centre.w / 2, 5000);
  const xOf = (title: string) => items.find((item) => item.type === "sticky" && item.props.text.startsWith(title))?.x ?? 0;
  assert.ok(xOf("Processes") > 5000 && xOf("Memory") > 5000 && xOf("Files") > 5000);
  assert.ok(xOf("Devices") < 5000 && xOf("Security") < 5000);
  assert.ok(Math.min(...items.map((item) => item.zIndex)) >= 100);
});

test("branches that cite the same page share one card", () => {
  const draft = parseMapReply({ centre: "OS", branches: [{ title: "A", passage: 1 }, { title: "B", passage: 2 }, { title: "C", passage: 1 }] }, 2) as MapDraft;
  const sameNote: MapSourceCard = { kind: "note", noteId: "page1", title: "OS page", excerpt: "" };
  const items = layoutMap(draft, { sources: new Map([[1, sameNote], [2, { ...sameNote, blockId: "b_AAAAAAAAAA" }]]), newId });
  assert.equal(items.filter((item) => item.type === "note-card").length, 1);
  const sourceLinks = items.filter((item) => item.type === "connector" && item.props.label?.text === "source");
  assert.equal(sourceLinks.length, 3, "every branch still links to it");
  assert.equal(items.length, mapElementCount(draft, new Map([[1, sameNote], [2, { ...sameNote, blockId: "b_AAAAAAAAAA" }]])));
});
