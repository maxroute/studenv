import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkspaceSceneJson, serializeWorkspaceScene, type ConnectorNode, type StudioItem } from "@/types/workspace";
import { computeConnectorRoute } from "./connector-routing";
import { composeBoard, flowRanks, layoutSection, sectionDraftSchema, wrappedLines, type BoardSection, type MediaSection } from "./board-sections";

const ids = () => {
  let n = 0;
  return () => `item-${++n}`;
};

const flowchart = sectionDraftSchema.parse({
  type: "flowchart",
  heading: "How a request is checked",
  nodes: [
    { id: "a", kind: "start", text: "Request arrives with a token" },
    { id: "b", kind: "step", text: "Read the token from the Authorization header" },
    { id: "c", kind: "decision", text: "Signature valid?" },
    { id: "d", kind: "decision", text: "Expired?" },
    { id: "e", kind: "step", text: "Load the user and run the handler" },
    { id: "f", kind: "end", text: "Reject with 401" },
    { id: "g", kind: "step", text: "Ask the client to refresh the token" },
  ],
  edges: [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "c", to: "d", label: "yes" },
    { from: "c", to: "f", label: "no" },
    { from: "d", to: "e", label: "no" },
    { from: "d", to: "g", label: "yes" },
    { from: "g", to: "a", label: "retry" },
    { from: "b", to: "e" },
  ],
});

const diagram = sectionDraftSchema.parse({
  type: "diagram",
  heading: "Anatomy of a JWT",
  joiner: ".",
  parts: [
    { name: "Header", detail: "Says which algorithm signs the token, such as HS256 or RS256." },
    { name: "Payload", detail: "Carries the claims: who the user is, when the token expires, and what it allows." },
    { name: "Signature", detail: "Proves the first two parts were not changed." },
  ],
});

const comparison = sectionDraftSchema.parse({
  type: "comparison",
  heading: "Sessions and tokens",
  columns: ["Server sessions", "JWT"],
  rows: [
    { label: "Where state lives", cells: ["On the server, looked up by a session id on every request", "Inside the token the client holds"] },
    { label: "Revoking", cells: ["Delete the session"] },
  ],
});

const timeline = sectionDraftSchema.parse({
  type: "timeline",
  heading: "Learning plan",
  milestones: [
    { when: "Day 1", title: "Encoding", detail: "Base64url and JSON" },
    { when: "Day 2", title: "Signing", detail: "HMAC and RSA" },
    { title: "Refresh tokens" },
  ],
});

const media: MediaSection = {
  type: "media",
  heading: "Watch and look",
  videos: [
    { assetId: "v1", title: "JWT explained" },
    { assetId: "v2", title: "Signing in depth" },
  ],
  images: [{ src: "https://upload.wikimedia.org/a.png", width: 800, height: 500, alt: "Token flow", credit: "A. Author, CC BY-SA 4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:A.png" }],
};

const all: BoardSection[] = [diagram, flowchart, comparison, timeline, media];

type Solid = Exclude<StudioItem, ConnectorNode>;
const solids = (items: StudioItem[]) => items.filter((item): item is Solid => item.type !== "connector");
const overlap = (a: Solid, b: Solid) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function assertTidy(items: StudioItem[], name: string) {
  const boxes = solids(items);
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) assert.ok(!overlap(boxes[i], boxes[j]), `${name}: ${boxes[i].id} overlaps ${boxes[j].id}`);
  }
}

/** Every drawn line, as the board routes it, stays out of every element it doesn't join. */
function assertLinesClear(items: StudioItem[], name: string) {
  for (const item of items) {
    if (item.type !== "connector") continue;
    const route = computeConnectorRoute(item.props, items);
    assert.ok(route, `${name}: ${item.id} has no route`);
    for (const box of solids(items)) {
      if (box.id === item.props.source.id || box.id === item.props.target.id) continue;
      for (let i = 1; i < route.points.length; i += 1) {
        const [a, b] = [route.points[i - 1], route.points[i]];
        for (let step = 0; step <= 100; step += 1) {
          const x = a.x + ((b.x - a.x) * step) / 100;
          const y = a.y + ((b.y - a.y) * step) / 100;
          const inside = x > box.x + 1 && x < box.x + box.w - 1 && y > box.y + 1 && y < box.y + box.h - 1;
          assert.ok(!inside, `${name}: line ${item.props.source.id}→${item.props.target.id} crosses ${box.id}`);
        }
      }
    }
  }
}

for (const section of all) {
  test(`${section.type}: elements don't overlap, lines stay clear and everything fits the section`, () => {
    const layout = layoutSection(section, ids());
    assert.ok(layout);
    assertTidy(layout.items, section.type);
    assertLinesClear(layout.items, section.type);
    for (const item of solids(layout.items)) {
      assert.ok(item.x >= 0 && item.y >= 0 && item.x + item.w <= layout.width + 1 && item.y + item.h <= layout.height + 1, `${item.id} is outside the section`);
    }
  });
}

test("branching and looping flowcharts never draw a line through a shape", () => {
  let seed = 7;
  const random = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return Math.floor((seed / 2147483648) * n);
  };
  for (let run = 0; run < 150; run += 1) {
    const count = 3 + random(7);
    const nodes = Array.from({ length: count }, (_, i) => ({ id: `n${i}`, kind: i === 0 ? "start" : random(3) === 0 ? "decision" : "step", text: `Step ${i} ${"word ".repeat(random(8))}` }));
    const edges = Array.from({ length: count - 1 }, (_, i) => ({ from: `n${random(i + 1)}`, to: `n${i + 1}` }));
    for (let k = 0; k < 2; k += 1) edges.push({ from: `n${random(count)}`, to: `n${random(count)}` });
    const layout = layoutSection(sectionDraftSchema.parse({ type: "flowchart", heading: "h", nodes, edges }), ids());
    assert.ok(layout);
    assertTidy(layout.items, `run ${run}`);
    assertLinesClear(layout.items, `run ${run}`);
  }
});

test("a decision with two outcomes keeps them side by side", () => {
  const layout = layoutSection(
    sectionDraftSchema.parse({
      type: "flowchart",
      heading: "h",
      nodes: [{ id: "a", kind: "decision", text: "Valid?" }, { id: "b", kind: "end", text: "Allow" }, { id: "c", kind: "end", text: "Reject" }],
      edges: [{ from: "a", to: "b", label: "yes" }, { from: "a", to: "c", label: "no" }],
    }),
    ids(),
  );
  assert.ok(layout);
  const shapes = layout.items.flatMap((item) => (item.type === "shape" ? [item] : []));
  const [yes, no] = ["Allow", "Reject"].map((text) => shapes.find((shape) => shape.props.text === text));
  assert.ok(yes && no);
  assert.equal(yes.y, no.y);
  assert.notEqual(yes.x, no.x);
});

test("nothing is grouped, so every shape can be selected alone and typed into", () => {
  for (const item of composeBoard("JWT", all, ids())) assert.equal((item.props as { groupId?: string }).groupId, undefined);
});

test("a flowchart reads downwards, with the loop kept out of the ranking", () => {
  assert.equal(flowchart.type, "flowchart");
  if (flowchart.type !== "flowchart") return;
  const { rank, loops } = flowRanks(flowchart);
  assert.deepEqual([...loops], ["g a"]);
  for (const edge of flowchart.edges) {
    if (!loops.has(`${edge.from} ${edge.to}`)) assert.ok((rank.get(edge.from) as number) < (rank.get(edge.to) as number), `${edge.from} is above ${edge.to}`);
  }
});

test("a flowchart writes its steps inside shapes, with decisions as diamonds", () => {
  const layout = layoutSection(flowchart, ids());
  assert.ok(layout);
  const shapes = layout.items.flatMap((item) => (item.type === "shape" ? [item] : []));
  assert.equal(shapes.length, 7);
  assert.equal(shapes.filter((shape) => shape.props.kind === "diamond").length, 2);
  assert.ok(shapes.every((shape) => shape.props.text));
  assert.ok(!layout.items.some((item) => item.type === "sticky"));
});

test("edges to missing nodes are dropped, and a flowchart with none left is skipped", () => {
  const broken = sectionDraftSchema.parse({
    type: "flowchart",
    heading: "Broken",
    nodes: [{ id: "a", kind: "step", text: "A" }, { id: "b", kind: "step", text: "B" }],
    edges: [{ from: "a", to: "zz" }, { from: "a", to: "a" }],
  });
  assert.equal(layoutSection(broken, ids()), null);
});

test("an empty media row is skipped", () => {
  assert.equal(layoutSection({ type: "media", heading: "Nothing", videos: [], images: [] }, ids()), null);
});

test("a missing table cell shows a dash and extra cells are ignored", () => {
  const layout = layoutSection(comparison, ids());
  assert.ok(layout);
  assert.equal(layout.items.filter((item) => item.type === "shape" && item.props.text === "—").length, 1);
});

test("a composed board stacks its sections and survives saving and loading", () => {
  const items = composeBoard("JSON Web Tokens", all, ids());
  assertTidy(items, "board");
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  assert.equal(new Set(items.map((item) => item.zIndex)).size, items.length);
  const loaded = parseWorkspaceSceneJson(serializeWorkspaceScene({ items, viewport: { x: 0, y: 0, zoom: 1 } }));
  assert.equal(loaded.items.length, items.length);
});

test("drafts outside the limits are refused", () => {
  assert.ok(!sectionDraftSchema.safeParse({ type: "timeline", heading: "x", milestones: [{ title: "only one" }] }).success);
  assert.ok(!sectionDraftSchema.safeParse({ type: "media", heading: "x", videos: [], images: [] }).success);
});

test("longer text wraps to more lines, and a word wider than a line breaks", () => {
  assert.equal(wrappedLines("short", 200), 1);
  assert.ok(wrappedLines("a much longer sentence that cannot fit on one narrow line", 100) > 3);
  assert.ok(wrappedLines("abcdefghijklmnopqrstuvwxyz", 90) >= 3);
});
