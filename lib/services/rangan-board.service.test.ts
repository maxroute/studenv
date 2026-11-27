import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkspaceSceneJson } from "@/types/workspace";
import { createMapBoardSchema, createRanganBoardService } from "./rangan-board.service";

const DRAFT = {
  title: "OS map",
  centre: "Operating System",
  image: null,
  video: null,
  branches: [
    { title: "Kernel", note: "The core", relation: "has", source: 1, steps: false, image: null, children: [{ title: "Scheduler", note: "" }] },
    { title: "Files", note: "", relation: "organizes", source: 2, steps: false, image: null, children: [] },
    { title: "Memory", note: "", relation: "manages", source: 3, steps: false, image: "Paging", children: [{ title: "Paging", note: "" }] },
  ],
  links: [],
  tips: ["Draw the layers"],
};

function setup() {
  const created: Array<{ ownerId: string; title: string; sceneJson: string }> = [];
  const links: Array<{ ownerId: string; url: string; title: string }> = [];
  const videos: Array<{ ownerId: string; videoId: string; title: string }> = [];
  let counter = 0;
  const service = createRanganBoardService({
    findNoteCard: async (ownerId, noteId) => (ownerId === "u1" && (noteId === "n1" || noteId === "page1") ? { title: noteId === "n1" ? "CS notes" : "OS page", excerpt: "Text." } : null),
    findAssetCard: async (ownerId, assetId) => (ownerId === "u1" && assetId === "a1" ? { title: "Textbook", kind: "pdf" } : null),
    findItemCard: async (ownerId, itemId) => (ownerId === "u1" && itemId === "i1" ? { assetId: "a9", title: "Saved article", kind: "webpage", sourceHost: "example.com" } : null),
    saveLink: async (ownerId, link) => {
      links.push({ ownerId, ...link });
      return { assetId: `w${links.length}`, title: link.title, sourceHost: new URL(link.url).hostname };
    },
    saveVideo: async (ownerId, video) => {
      videos.push({ ownerId, ...video });
      return { assetId: "v1", title: video.title };
    },
    createBoard: async (ownerId, title, sceneJson) => {
      created.push({ ownerId, title, sceneJson });
      return "board1";
    },
    newId: () => `id${counter++}`,
  });
  return { service, created, links, videos };
}

test("a map board is created with cards for the user's own sources and the page written with it", async () => {
  const { service, created } = setup();
  const result = await service.createMapBoard("u1", {
    draft: DRAFT,
    sources: [
      { n: 1, ref: "note:n1#b_AAAAAAAAAA" },
      { n: 2, ref: "asset:a1#page4" },
      { n: 3, ref: "asset:someone-elses" },
    ],
    pageNoteId: "page1",
    images: [],
    reading: [],
    video: null,
  });
  assert.deepEqual(result, { workspaceId: "board1" });
  assert.equal(created[0].title, "OS map");
  const scene = parseWorkspaceSceneJson(created[0].sceneJson);
  assert.equal(scene.preservedItems.length, 0);
  const cards = scene.items.filter((item) => item.type === "note-card" || item.type === "resource-card");
  assert.deepEqual(
    cards.map((item) => (item.type === "note-card" ? ["note", item.props.noteId, item.props.blockId ?? null] : ["asset", item.type === "resource-card" ? item.props.assetId : "", null])),
    [
      ["note", "n1", "b_AAAAAAAAAA"],
      ["asset", "a1", null],
      ["note", "page1", null],
    ],
  );
  const solid = scene.items.filter((item) => item.type !== "connector");
  assert.equal(Math.min(...solid.map((item) => item.x)), 0, "the map starts at the board's top-left");
  assert.equal(Math.min(...solid.map((item) => item.y)), 0);
  assert.deepEqual(scene.viewport, { x: 40, y: 40, zoom: 0.5 });
});

test("the draft is checked again when it comes back from the browser", () => {
  assert.equal(createMapBoardSchema.safeParse({ draft: DRAFT, sources: [] }).success, true);
  const older = { ...DRAFT, image: undefined, video: undefined, branches: DRAFT.branches.map(({ steps: _steps, image: _image, ...rest }) => rest) };
  assert.equal(createMapBoardSchema.safeParse({ draft: older, sources: [] }).success, true, "a draft from before pictures and steps still works");
  assert.equal(createMapBoardSchema.safeParse({ draft: { ...DRAFT, branches: DRAFT.branches.slice(0, 1) }, sources: [] }).success, false, "fewer than 2 branches");
  assert.equal(createMapBoardSchema.safeParse({ draft: { ...DRAFT, extra: true }, sources: [] }).success, false);
  assert.equal(createMapBoardSchema.safeParse({ draft: { ...DRAFT, centre: "x".repeat(61) }, sources: [] }).success, false);
  const many = Array.from({ length: 9 }, (_, index) => ({ ...DRAFT.branches[1], title: `B${index}` }));
  assert.equal(createMapBoardSchema.safeParse({ draft: { ...DRAFT, branches: many }, sources: [] }).success, false, "more than 8 branches");
});

const PICTURE = {
  target: "Memory",
  src: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Paging.svg/640px-Paging.svg.png",
  width: 640,
  height: 480,
  alt: "Paging",
  credit: "Jane Doe · CC BY-SA 4.0",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Paging.svg",
};

test("pictures and further reading are checked: only Commons pictures and Wikipedia articles", () => {
  const base = { draft: DRAFT, sources: [] };
  assert.equal(createMapBoardSchema.safeParse({ ...base, images: [PICTURE], reading: [{ title: "Paging", url: "https://en.wikipedia.org/wiki/Paging" }] }).success, true);
  assert.equal(createMapBoardSchema.safeParse({ ...base, images: [{ ...PICTURE, src: "https://example.com/x.png" }] }).success, false, "a picture from anywhere else");
  assert.equal(createMapBoardSchema.safeParse({ ...base, images: [{ ...PICTURE, src: "https://upload.wikimedia.org/wikipedia/en/thumb/5/5f/Logo.svg/640px-Logo.svg.png" }] }).success, false, "a Wikipedia-only (maybe fair-use) file");
  assert.equal(createMapBoardSchema.safeParse({ ...base, images: [{ ...PICTURE, sourceUrl: "https://example.com" }] }).success, false);
  assert.equal(createMapBoardSchema.safeParse({ ...base, images: [PICTURE, PICTURE, PICTURE, PICTURE] }).success, false, "more than three pictures");
  assert.equal(createMapBoardSchema.safeParse({ ...base, reading: [{ title: "Bad", url: "https://example.com/wiki/Paging" }] }).success, false, "reading must be Wikipedia");
});

test("a map board gets its pictures, saved links for its reading, and cards for Shelf articles", async () => {
  const { service, created, links } = setup();
  await service.createMapBoard(
    "u1",
    createMapBoardSchema.parse({
      draft: DRAFT,
      sources: [{ n: 2, ref: "item:i1" }, { n: 3, ref: "item:not-mine" }],
      images: [PICTURE, { ...PICTURE, target: "Not on the map" }, { ...PICTURE, target: "memory" }],
      reading: [
        { title: "Paging", url: "https://en.wikipedia.org/wiki/Paging" },
        { title: "Paging", url: "https://en.wikipedia.org/wiki/Paging" },
        { title: "Kernel", url: "https://en.wikipedia.org/wiki/Kernel_(operating_system)" },
      ],
    }),
  );
  assert.deepEqual(links, [
    { ownerId: "u1", url: "https://en.wikipedia.org/wiki/Paging", title: "Paging" },
    { ownerId: "u1", url: "https://en.wikipedia.org/wiki/Kernel_(operating_system)", title: "Kernel" },
  ], "each article is saved once, for this user");
  const scene = parseWorkspaceSceneJson(created[0].sceneJson);
  assert.equal(scene.items.filter((item) => item.type === "image").length, 1, "one picture per branch, and none for titles not on the map");
  const cards = scene.items.flatMap((item) => (item.type === "resource-card" ? [[item.props.assetId, item.props.kind]] : []));
  assert.deepEqual(cards, [["a9", "webpage"], ["w1", "webpage"], ["w2", "webpage"]]);
});

test("a lesson video is saved for this user and shown under the centre; only real YouTube ids are accepted", async () => {
  const base = { draft: DRAFT, sources: [] };
  assert.equal(createMapBoardSchema.safeParse({ ...base, video: { videoId: "bad id", title: "x", channel: "" } }).success, false);
  assert.equal(createMapBoardSchema.safeParse({ ...base, video: { videoId: "AAAAAAAAAAA", title: "x", channel: "", url: "https://evil" } }).success, false, "no address from the browser");
  const { service, created, videos } = setup();
  await service.createMapBoard("u1", createMapBoardSchema.parse({ ...base, video: { videoId: "AAAAAAAAAAA", title: "Operating systems in 10 minutes", channel: "Teacher" } }));
  assert.deepEqual(videos, [{ ownerId: "u1", videoId: "AAAAAAAAAAA", title: "Operating systems in 10 minutes" }]);
  const scene = parseWorkspaceSceneJson(created[0].sceneJson);
  const card = scene.items.find((item) => item.type === "resource-card" && item.props.kind === "video");
  assert.ok(card && card.type === "resource-card" && card.props.assetId === "v1");
  assert.ok(scene.items.some((item) => item.type === "connector" && item.props.target.id === card.id && item.props.label?.text === "watch"));
});

test("a board's diagrams, extra videos and pictures go under the map, without overlapping it", async () => {
  const { service, created, videos } = setup();
  const input = createMapBoardSchema.parse({
    draft: DRAFT,
    sources: [],
    video: { videoId: "aaaaaaaaaaa", title: "OS in 10 minutes", channel: "C" },
    sections: [
      { type: "diagram", heading: "Layers", joiner: "", parts: [{ name: "Kernel", detail: "Talks to the hardware." }, { name: "Shell", detail: "Talks to you." }] },
      { type: "timeline", heading: "Boot", milestones: [{ when: "", title: "BIOS", detail: "" }, { when: "", title: "Kernel", detail: "" }] },
    ],
    // The first repeats the map's own video, so only the second is saved again.
    videos: [
      { videoId: "aaaaaaaaaaa", title: "OS in 10 minutes", channel: "C" },
      { videoId: "bbbbbbbbbbb", title: "Paging explained", channel: "C" },
    ],
    pictures: [{ src: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.png/400px-X.png", width: 400, height: 300, alt: "Pages", credit: "A, CC BY 4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:X.png" }],
  });
  await service.createMapBoard("u1", input);
  assert.deepEqual(videos.map((video) => video.videoId), ["aaaaaaaaaaa", "bbbbbbbbbbb"]);
  const scene = parseWorkspaceSceneJson(created[0].sceneJson);
  const texts = scene.items.flatMap((item) => (item.type === "free-text" ? [item.props.text] : []));
  for (const heading of ["Layers", "Boot", "Watch and look"]) assert.ok(texts.includes(heading), heading);
  const solid = scene.items.filter((item) => item.type !== "connector");
  const mapBottom = Math.max(...solid.filter((item) => item.type === "sticky").map((item) => item.y + item.h));
  const layers = solid.find((item) => item.type === "free-text" && item.props.text === "Layers");
  assert.ok(layers && layers.y > mapBottom, "the diagrams start below the map");
  assert.equal(Math.min(...solid.map((item) => item.x)), 0);
  assert.equal(new Set(scene.items.map((item) => item.id)).size, scene.items.length);
});

test("sections that don't fit the limits are refused when the draft comes back", () => {
  const tooMany = Array.from({ length: 4 }, () => ({ type: "timeline", heading: "t", milestones: [{ title: "a" }, { title: "b" }] }));
  assert.equal(createMapBoardSchema.safeParse({ draft: DRAFT, sources: [], sections: tooMany }).success, false);
});
