import assert from "node:assert/strict";
import test from "node:test";
import { WORKSPACE_SCENE_FORMAT, WORKSPACE_SCENE_VERSION, WorkspaceSceneSchema, type StudioItem } from "@/types/workspace";
import { layoutMap, MAP_LEGEND, MAP_MAX_IMAGES, mapElementCount, mapImageSize, mapInstruction, mapOutline, parseMapReply, stickyText, type MapDraft, type MapImage, type MapSourceCard } from "./mind-map";

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
  for (const part of ['"centre"', '"branches"', '"relation"', '"children"', '"links"', '"tips"', "passage", '"steps"', '"image"']) assert.ok(text.includes(part), part);
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

/** Notes, cards and pictures: what must never cover each other. Frames sit behind them on purpose. */
const boxes = (items: StudioItem[]) => items.filter((item) => item.type !== "connector" && item.type !== "free-text" && item.type !== "shape");
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
  const minConnectorZ = Math.min(...connectors.map((c) => c.zIndex));
  assert.ok(items.filter((item) => item.type === "shape").every((frame) => frame.zIndex < minConnectorZ), "frames are at the back");
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

const frames = (items: StudioItem[]) => items.filter((item): item is Extract<StudioItem, { type: "shape" }> => item.type === "shape");

test("each branch sits on its own frame, in its group, and frames never overlap", () => {
  const draft = parseMapReply(REPLY, 3) as MapDraft;
  const items = layoutMap(draft, { newId });
  const all = frames(items);
  assert.equal(all.length, draft.branches.length);
  for (let i = 0; i < all.length; i += 1) {
    assert.equal(all[i].props.kind, "rounded-rectangle");
    assert.equal(all[i].props.stroke.style, "dashed");
    for (let j = i + 1; j < all.length; j += 1) assert.equal(overlap(all[i], all[j]), false, "frames overlap");
  }
  const stickies = items.filter((item): item is Extract<StudioItem, { type: "sticky" }> => item.type === "sticky");
  for (const sticky of stickies.filter((item) => item.props.groupId)) {
    const frame = all.find((f) => f.props.groupId === sticky.props.groupId);
    assert.ok(frame, "a frame for every branch group");
    assert.ok(sticky.x >= frame.x && sticky.y >= frame.y && sticky.x + sticky.w <= frame.x + frame.w && sticky.y + sticky.h <= frame.y + frame.h, "the frame surrounds its stickies");
  }
});

test("the title and legend are text, and the legend stays clear of every frame", () => {
  const draft = parseMapReply(REPLY, 3) as MapDraft;
  const items = layoutMap(draft, { newId });
  const texts = items.filter((item): item is Extract<StudioItem, { type: "free-text" }> => item.type === "free-text");
  assert.ok(texts.some((item) => item.props.text === "Operating systems map"));
  const legend = texts.find((item) => item.props.text === MAP_LEGEND);
  assert.ok(legend);
  assert.ok(frames(items).every((frame) => !overlap(frame, legend)));
  const title = texts.find((item) => item.props.text === "Operating systems map");
  assert.ok(title && !overlap(title, legend) && frames(items).every((frame) => !overlap(frame, title)), "the title is above the map, clear of the legend");

  const narrow = layoutMap(parseMapReply({ centre: "OS", title: "Small", branches: [{ title: "A" }, { title: "B" }] }, 0) as MapDraft, { newId });
  const narrowTexts = narrow.filter((item): item is Extract<StudioItem, { type: "free-text" }> => item.type === "free-text");
  const [smallTitle, smallLegend] = ["Small", MAP_LEGEND].map((value) => narrowTexts.find((item) => item.props.text === value));
  assert.ok(smallTitle && smallLegend && !overlap(smallTitle, smallLegend), "a narrow map stacks the legend above the title");
});

test("steps are numbered and chained with arrows; other children fan out", () => {
  const draft = parseMapReply({ centre: "Booting", branches: [{ title: "Startup", steps: true, children: [{ title: "POST" }, { title: "Bootloader" }, { title: "Kernel" }] }, { title: "Parts", steps: true, children: [{ title: "Only one" }] }, { title: "Kinds", children: [{ title: "Cold" }, { title: "Warm" }] }] }, 0) as MapDraft;
  assert.deepEqual(draft.branches.map((b) => b.steps), [true, false, false], "one child is not a sequence");
  const items = layoutMap(draft, { newId });
  const byId = new Map(items.map((item) => [item.id, item]));
  const first = (id: string | undefined) => {
    const item = id ? byId.get(id) : undefined;
    return item?.type === "sticky" ? item.props.text.split("\n")[0] : "?";
  };
  const edges = items.flatMap((item) => (item.type === "connector" ? [[first(item.props.source.id), first(item.props.target.id), item.props.rearEndpointStyle]] : []));
  assert.deepEqual(edges.filter(([from]) => from !== "Booting"), [
    ["Startup", "1. POST", "arrow"],
    ["1. POST", "2. Bootloader", "arrow"],
    ["2. Bootloader", "3. Kernel", "arrow"],
    ["Parts", "Only one", "none"],
    ["Kinds", "Cold", "none"],
    ["Kinds", "Warm", "none"],
  ]);
});

test("at most three pictures are asked for, the centre's first", () => {
  const draft = parseMapReply(
    { centre: "OS", image: "Operating system", branches: [{ title: "A", image: "Paging" }, { title: "B", image: "null" }, { title: "C", image: "Process state" }, { title: "D", image: "Kernel" }] },
    0,
  ) as MapDraft;
  assert.equal(draft.image, "Operating system");
  assert.deepEqual(draft.branches.map((b) => b.image), ["Paging", null, "Process state", null]);
  assert.equal([draft.image, ...draft.branches.map((b) => b.image)].filter(Boolean).length, MAP_MAX_IMAGES);
});

const PICTURE = (target: string, width = 800, height = 600): MapImage => ({
  target,
  src: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${target || "Centre"}.png/640px-${target || "Centre"}.png`,
  width,
  height,
  alt: `${target || "Centre"} article`,
  credit: "Jane Doe · CC BY-SA 4.0",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:X.png",
});

test("pictures go in their branch's frame with a credit underneath, without covering anything", () => {
  const draft = parseMapReply(REPLY, 3) as MapDraft;
  const images = [PICTURE(""), PICTURE("memory", 300, 900), PICTURE("Devices")];
  const sources = new Map<number, MapSourceCard>([[1, { kind: "asset", assetId: "a1", assetKind: "webpage", title: "Article", sourceHost: "example.com" }]]);
  const reading = [{ assetId: "w1", title: "Operating system", sourceHost: "en.wikipedia.org" }, { assetId: "w2", title: "Kernel (operating system)", sourceHost: "en.wikipedia.org" }];
  const items = layoutMap(draft, { sources, images, reading, page: { noteId: "page1", title: "OS", excerpt: "" }, newId });
  const scene = WorkspaceSceneSchema.safeParse({ format: WORKSPACE_SCENE_FORMAT, version: WORKSPACE_SCENE_VERSION, items, workspaceAssetIds: [], viewport: { x: 0, y: 0, zoom: 1 } });
  assert.ok(scene.success, scene.success ? "" : JSON.stringify(scene.error.issues.slice(0, 3)));
  assert.equal(items.length, mapElementCount(draft, sources, { images: images.length, reading: reading.length }) + 2, "count, plus the page card and its connector");

  const pictures = items.filter((item): item is Extract<StudioItem, { type: "image" }> => item.type === "image");
  assert.equal(pictures.length, 3);
  const tall = pictures.find((item) => item.props.alt === "memory article");
  assert.ok(tall);
  assert.deepEqual({ w: tall.w, h: tall.h }, mapImageSize({ width: 300, height: 900 }));
  assert.ok(Math.abs(tall.w / tall.h - 300 / 900) < 0.02, "the picture keeps its shape");
  const memoryFrame = frames(items).find((frame) => frame.props.groupId === tall.props.groupId);
  assert.ok(memoryFrame && tall.x >= memoryFrame.x && tall.x + tall.w <= memoryFrame.x + memoryFrame.w, "inside its branch's frame");
  const credits = items.filter((item) => item.type === "free-text" && item.props.text.includes("Wikimedia Commons"));
  assert.equal(credits.length, 3, "every picture is credited");
  assert.ok(credits.every((credit) => credit.type === "free-text" && credit.props.text.includes("CC BY-SA 4.0")));

  const solid = boxes(items);
  for (let i = 0; i < solid.length; i += 1) {
    for (let j = i + 1; j < solid.length; j += 1) assert.equal(overlap(solid[i], solid[j]), false, `${solid[i].type} ${solid[i].id} overlaps ${solid[j].type} ${solid[j].id}`);
  }
  const webCards = items.filter((item) => item.type === "resource-card" && item.props.kind === "webpage");
  assert.deepEqual(webCards.map((item) => (item.type === "resource-card" ? item.props.title : "")), ["Article", "Operating system", "Kernel (operating system)"]);
  assert.ok(items.some((item) => item.type === "free-text" && item.props.text === "Further reading"));
});

test("a picture for a title that isn't on the map is left out", () => {
  const draft = parseMapReply(REPLY, 3) as MapDraft;
  const items = layoutMap(draft, { images: [PICTURE("Not a branch")], newId });
  assert.equal(items.filter((item) => item.type === "image").length, 0);
});
