// ---------------------------------------------------------------------------
// Link rows for the index (design doc §3.2)
// ---------------------------------------------------------------------------
//
// Pure: turns a source's references into rows of "source points at target".
// Only grammar-valid references and kinds from LINK_KINDS are emitted.
// References of types this build does not know are included as they are.

import { assetRefType } from "@/lib/refs/ref-types";
import { encodeRefPart, parseRef, type Ref } from "@/lib/refs/ref-grammar";
import { isLinkKind, type LinkKind } from "@/lib/refs/link-kinds";
import type { WorkspaceNode } from "@/types/workspace";

export type LinkRow = {
  sourceType: string;
  sourceId: string;
  sourceAnchor: string;
  targetType: string;
  targetId: string;
  targetAnchor: string;
  kind: LinkKind;
};

export type SourceRef = { ref: Ref; kind: LinkKind; sourceAnchor: string };

const MAX_ANCHOR = 256;

/** Rows for one source, deduplicated and in a stable order. */
export function toLinkRows(source: { type: string; id: string }, refs: readonly SourceRef[]): LinkRow[] {
  const rows = new Map<string, LinkRow>();
  for (const { ref, kind, sourceAnchor } of refs) {
    if (!isLinkKind(kind) || sourceAnchor.length > MAX_ANCHOR) continue;
    const row: LinkRow = {
      sourceType: source.type,
      sourceId: source.id,
      sourceAnchor,
      targetType: ref.type,
      targetId: ref.id,
      targetAnchor: ref.anchor ?? "",
      kind,
    };
    rows.set(linkRowKey(row), row);
  }
  return [...rows.values()].sort((a, b) => (linkRowKey(a) < linkRowKey(b) ? -1 : 1));
}

export function linkRowKey(row: LinkRow): string {
  return [row.sourceAnchor, row.targetType, row.targetId, row.targetAnchor, row.kind].join("\u0000");
}

function assetRef(assetId: string, anchor?: string): Ref | null {
  return parseRef(`asset:${encodeRefPart(assetId, "id")}${anchor ? `#${anchor}` : ""}`);
}

/**
 * References a workspace scene makes. The source anchor is always the node
 * id, which is what makes a card addressable (`workspace:w1#item-9`). Images
 * are decorative and excluded. New node types add a case here.
 */
export function extractSceneRefs(items: readonly WorkspaceNode[]): SourceRef[] {
  const refs: SourceRef[] = [];
  const push = (ref: Ref | null, kind: LinkKind, nodeId: string) => {
    if (ref) refs.push({ ref, kind, sourceAnchor: encodeRefPart(nodeId, "anchor") });
  };
  for (const node of items) {
    switch (node.type) {
      case "resource-card":
        push(assetRef(node.props.assetId), "card", node.id);
        break;
      case "pdf-page":
      case "pdf-fragment":
        push(assetRef(node.props.assetId, assetRefType.formatAnchor?.({ kind: "page", page: node.props.pageNumber })), "embed", node.id);
        break;
      case "video-anchor":
        push(assetRef(node.props.assetId, assetRefType.formatAnchor?.({ kind: "time", ms: node.props.startTimeMs })), "citation", node.id);
        break;
      default:
        break;
    }
  }
  return refs;
}
