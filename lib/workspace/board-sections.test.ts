import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkspaceSceneJson, serializeWorkspaceScene, type ConnectorNode, type StudioItem } from "@/types/workspace";
import { computeConnectorRoute } from "./connector-routing";
import { asBlock, leaveDetailToDiagrams, sectionsInstruction, composeBoard, flowRanks, layoutSection, parseSectionsReply, sectionDraftSchema, stackBlocks, wrappedLines, type BoardSection, type MediaSection } from "./board-sections";

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

test("Rangan's plan is trimmed to the limits, keeps one section of each type and drops broken ones", () => {
  const plan = parseSectionsReply({
    sections: [
      { type: "flowchart", heading: "Check", nodes: [{ id: "a", kind: "begin", text: "x".repeat(200) }, { id: "b", kind: "end", text: "Done" }], edges: [{ from: "a", to: "b", label: "" }] },
      { type: "flowchart", heading: "Second flowchart", nodes: [{ id: "a", text: "A" }, { id: "b", text: "B" }], edges: [{ from: "a", to: "b" }] },
      { type: "comparison", heading: "Compare", columns: ["A", "B", "C", "D", "E"], rows: [{ label: "Speed", cells: ["fast", "slow", "", "", "extra", "more"] }, { label: "Cost", cells: ["low"] }] },
      { type: "diagram", heading: "Only one part", parts: [{ name: "A", detail: "a" }] },
      { type: "poem", heading: "No" },
      { type: "timeline", heading: "Lines that go nowhere", milestones: "none" },
    ],
    videos: ["jwt explained", "jwt explained", "null", "", "refresh tokens", "fourth search"],
    images: ["JSON Web Token", 4, "Base64"],
  });
  assert.deepEqual(plan.sections.map((section) => section.type), ["flowchart", "comparison"]);
  const flow = plan.sections[0];
  assert.ok(flow.type === "flowchart");
  assert.equal(flow.nodes[0].kind, "step");
  assert.equal(flow.nodes[0].text.length, 90);
  const table = plan.sections[1];
  assert.ok(table.type === "comparison");
  assert.equal(table.columns.length, 4);
  assert.equal(table.rows[0].cells.length, 4);
  assert.deepEqual(plan.videos, ["jwt explained", "refresh tokens", "fourth search"]);
  assert.deepEqual(plan.images, ["JSON Web Token", "Base64"]);
});

test("no plan, or a plan with nothing usable, means a board without diagrams", () => {
  assert.deepEqual(parseSectionsReply(null), { sections: [], videos: [], images: [] });
  assert.deepEqual(parseSectionsReply({ sections: "lots" }), { sections: [], videos: [], images: [] });
});

test("a block laid out elsewhere is moved to the corner, and blocks stack without overlapping", () => {
  const block = asBlock([
    { id: "s1", type: "sticky", x: -300, y: 50, w: 200, h: 100, rotation: 0, zIndex: 1, props: { text: "A", color: "#F8E7A1" } },
    { id: "s2", type: "sticky", x: 100, y: -20, w: 200, h: 100, rotation: 0, zIndex: 2, props: { text: "B", color: "#F8E7A1" } },
  ]);
  assert.deepEqual([block.width, block.height], [600, 170]);
  const diagramLayout = layoutSection(diagram, ids());
  assert.ok(diagramLayout);
  const items = stackBlocks(null, [block, diagramLayout], ids());
  assertTidy(items, "stacked");
  assert.equal(Math.min(...solids(items).map((item) => item.y)), 0);
});

test("table cells are read however the model writes them, and an empty table is left out", () => {
  const columns = ["Session", "JWT"];
  const read = (rows: unknown[]) => parseSectionsReply({ sections: [{ type: "comparison", heading: "Sessions vs JWT", columns, rows }] }).sections[0];
  const keyed = read([
    { label: "Storage", cells: { Session: "On the server", JWT: "In the token" } },
    { label: "Revoking", session: "Delete it", jwt: "Wait for expiry" },
    { label: "Scaling", values: ["Shared store", "Any server"] },
  ]);
  assert.ok(keyed?.type === "comparison");
  assert.deepEqual(keyed.rows.map((row) => row.cells), [["On the server", "In the token"], ["Delete it", "Wait for expiry"], ["Shared store", "Any server"]]);
  assert.equal(read([{ label: "Storage", cells: [] }, { label: "Scaling", cells: {} }, { label: "Load" }]), undefined);
  assert.equal(read([{ label: "Storage", cells: ["a", "b"] }, { label: "Scaling" }]), undefined, "one filled row isn't a comparison");
});

test("the map keeps the big picture and leaves to each diagram the detail it shows", () => {
  const branch = (title: string, children: string[], steps = false) => ({ title, note: `${title} in one line`, relation: "", source: null, steps, image: null, children: children.map((child) => ({ title: child, note: "" })) });
  // The map Rangan really planned for "Make a board on JWT authentication…".
  const draft = {
    title: "JWT Authentication",
    centre: "JWT Authentication",
    image: null,
    video: null,
    branches: [
      branch("Token Structure", ["Header", "Payload", "Signature"]),
      branch("Token Creation", ["Validate User", "Build Header", "Add Claims", "Sign Token"], true),
      branch("Token Verification", ["Extract Token", "Validate Signature", "Check Expiration", "Authorize Claims"]),
      branch("Sessions vs Tokens", ["Stateful Sessions", "Stateless Tokens", "Scalability", "Revocation"]),
      branch("Security Considerations", ["HTTPS Only", "Short Expiry", "Refresh Tokens", "Secret Management"]),
    ],
    links: [{ from: "Signature", to: "Validate Signature", label: "checks" }, { from: "Refresh Tokens", to: "Short Expiry", label: "pairs" }],
    tips: [],
  };
  const sections = parseSectionsReply({
    sections: [
      { type: "flowchart", heading: "Token Creation Process", nodes: [{ id: "a", kind: "start", text: "User logs in" }, { id: "b", kind: "step", text: "Validate credentials" }, { id: "c", kind: "step", text: "Build JWT header & payload" }, { id: "d", kind: "step", text: "Sign token with secret" }, { id: "e", kind: "end", text: "Issue JWT to client" }], edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "d" }, { from: "d", to: "e" }] },
      { type: "diagram", heading: "JWT Structure", joiner: ".", parts: [{ name: "Header", detail: "Algorithm" }, { name: "Payload", detail: "Claims" }, { name: "Signature", detail: "Proof" }] },
      { type: "comparison", heading: "Sessions vs Tokens", columns: ["Sessions", "Tokens"], rows: [{ label: "Storage", cells: ["server", "client"] }, { label: "Scalability", cells: ["harder", "easier"] }, { label: "Revocation", cells: ["instant", "hard"] }] },
    ],
  }).sections;
  const trimmed = leaveDetailToDiagrams(draft, sections);
  const children = Object.fromEntries(trimmed.branches.map((b) => [b.title, b.children.map((c) => c.title)]));
  assert.deepEqual(children["Token Structure"], []);
  // "Validate User" isn't "Validate credentials" word for word, so it stays: removing too little beats removing too much.
  assert.deepEqual(children["Token Creation"], ["Validate User", "Add Claims"]);
  // The table's rows are Scalability and Revocation; "Stateful Sessions" is only near its "Sessions" column, so it stays.
  assert.deepEqual(children["Sessions vs Tokens"], ["Stateful Sessions", "Stateless Tokens"]);
  // Branches no diagram covers are left exactly as they were.
  assert.deepEqual(children["Token Verification"], ["Extract Token", "Validate Signature", "Check Expiration", "Authorize Claims"]);
  assert.deepEqual(children["Security Considerations"], ["HTTPS Only", "Short Expiry", "Refresh Tokens", "Secret Management"]);
  assert.equal(trimmed.branches[1].steps, false);
  assert.ok(trimmed.branches.every((b) => b.note), "every branch keeps its one-line note");
  assert.deepEqual(trimmed.links.map((link) => link.from), ["Refresh Tokens"], "a link to a removed sub-point goes too");
  assert.equal(leaveDetailToDiagrams(draft, []).branches[0].children.length, 3, "no diagrams, nothing taken out");

  // Rangan's second plan: one flowchart for creating and checking a token covers two branches.
  const both = parseSectionsReply({
    sections: [
      {
        type: "flowchart",
        heading: "JWT Creation & Verification",
        nodes: ["Validate user credentials", "Build JWT header", "Add claims to payload", "Sign token", "Server extracts token", "Signature valid?", "Check expiration", "Claims authorized?", "Access granted"].map((text, i) => ({ id: `n${i}`, kind: i === 5 || i === 7 ? "decision" : "step", text })),
        edges: Array.from({ length: 8 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
      },
    ],
  }).sections;
  const after = Object.fromEntries(leaveDetailToDiagrams(draft, both).branches.map((b) => [b.title, b.children.map((c) => c.title)]));
  assert.deepEqual(after["Token Creation"], []);
  assert.deepEqual(after["Token Verification"], []);
  // "Refresh Tokens" and "Short Expiry" share a word with the chart but aren't in it.
  assert.deepEqual(after["Security Considerations"], ["HTTPS Only", "Short Expiry", "Refresh Tokens", "Secret Management"]);
});

test("the plan asks for separate outcomes, so a failed check never leads to success", () => {
  const text = sectionsInstruction("make a board on JWT", "JWT");
  assert.ok(text.includes("own end node"));
  assert.ok(text.includes("a failed check never leads to a success"));
  assert.ok(text.includes("History, a biography or how something developed over time gets a timeline, never a flowchart"));
});
