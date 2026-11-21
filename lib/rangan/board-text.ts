// ---------------------------------------------------------------------------
// A board as text Rangan can read and search
// ---------------------------------------------------------------------------
//
// Pure: no React, store or database. A board's words live in its stickies,
// text boxes, card titles and connector labels. Elements that share a group
// (a mind-map branch with its sub-notes) become one passage, headed by the
// group's first sticky; connectors inside become "A → label → B" lines so the
// structure survives. Everything else is packed into passages in reading order.

import { splitText, type Passage } from "@/lib/rangan/chunking";

/** One board element as text: what the board shows, and the group it belongs to. */
export type BoardTextNode = { id: string; type: string; text: string; groupId?: string };
export type BoardTextEdge = { from: string; to: string; label: string };

const MAX_PASSAGES = 60;
const PACK_CHARS = 900;

const oneLine = (text: string) => text.replace(/\s*\n+\s*/g, " — ").replace(/\s+/g, " ").trim();

/** The text of a scene element as the board shows it; "" for elements without words. */
export function elementText(item: { type: string; props?: unknown }): string {
  const props = (item.props ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof props[key] === "string" ? (props[key] as string) : "");
  switch (item.type) {
    case "sticky":
    case "free-text":
    case "text":
      return text("text");
    case "note-card":
      return text("title") ? `Page card: ${text("title")}${text("excerpt") ? ` — ${text("excerpt")}` : ""}` : "";
    case "resource-card":
      return text("title") ? `${text("kind") === "video" ? "Video" : text("kind") === "webpage" ? "Link" : "File"} card: ${text("title")}` : "";
    case "image":
      return text("alt") ? `Picture: ${text("alt")}` : "";
    default:
      return "";
  }
}

/** Scene items as text nodes and labelled edges. */
export function sceneText(items: ReadonlyArray<{ id: string; type: string; props?: unknown }>): { nodes: BoardTextNode[]; edges: BoardTextEdge[] } {
  const nodes: BoardTextNode[] = [];
  const edges: BoardTextEdge[] = [];
  for (const item of items) {
    const props = (item.props ?? {}) as Record<string, unknown>;
    if (item.type === "connector") {
      const end = (value: unknown) => (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" ? (value as { id: string }).id : "");
      const label = props.label && typeof props.label === "object" && typeof (props.label as { text?: unknown }).text === "string" ? (props.label as { text: string }).text : "";
      const from = end(props.source);
      const to = end(props.target);
      if (from && to) edges.push({ from, to, label });
      continue;
    }
    const text = elementText(item);
    if (text.trim()) nodes.push({ id: item.id, type: item.type, text, ...(typeof props.groupId === "string" ? { groupId: props.groupId } : {}) });
  }
  return { nodes, edges };
}

/**
 * A board's passages: one per group (headed by its first sticky's first
 * line), then the ungrouped elements packed in order. Connectors become
 * relation lines in the passage of the element they start from.
 */
export function boardPassages(nodes: readonly BoardTextNode[], edges: readonly BoardTextEdge[]): Passage[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  // A relation names each end by its title; a whole sticky would repeat its note.
  const firstLine = (node: BoardTextNode) => {
    const line = node.text.split("\n")[0].trim();
    return line.length > 48 ? `${line.slice(0, 47).trimEnd()}…` : line;
  };
  /** "A → label → B" lines; with `under`, the element is the line above, so it isn't named again. */
  const relations = (ids: ReadonlySet<string>, under = false) =>
    edges
      .filter((edge) => ids.has(edge.from) && byId.has(edge.to))
      .map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        const rest = `→ ${edge.label ? `${oneLine(edge.label)} → ` : ""}${to ? firstLine(to) : ""}`;
        return from && to ? (under ? `  ${rest}` : `${firstLine(from)} ${rest}`) : "";
      })
      .filter(Boolean);

  const groups = new Map<string, BoardTextNode[]>();
  const loose: BoardTextNode[] = [];
  for (const node of nodes) {
    if (node.groupId) groups.set(node.groupId, [...(groups.get(node.groupId) ?? []), node]);
    else loose.push(node);
  }

  const passages: Passage[] = [];
  for (const members of groups.values()) {
    const lead = members.find((node) => node.type === "sticky") ?? members[0];
    const lines = [...members.map((node) => oneLine(node.text)), ...relations(new Set(members.map((node) => node.id)))];
    for (const piece of splitText(lines.join("\n"))) passages.push({ anchor: "", heading: firstLine(lead).slice(0, 120), content: piece });
  }

  // Ungrouped elements: packed in order, with the relations they start.
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length) for (const piece of splitText(buffer.join("\n"))) passages.push({ anchor: "", heading: "", content: piece });
    buffer = [];
  };
  for (const node of loose) {
    const lines = [oneLine(node.text), ...relations(new Set([node.id]), true)];
    if (buffer.join("\n").length + lines.join("\n").length > PACK_CHARS) flush();
    buffer.push(...lines);
  }
  flush();
  return passages.filter((passage) => passage.content.trim()).slice(0, MAX_PASSAGES);
}
