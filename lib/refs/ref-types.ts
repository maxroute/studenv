// ---------------------------------------------------------------------------
// Reference type registry
// ---------------------------------------------------------------------------
//
// Gives each reference type its meaning. Rules (design doc §2.2):
// 1. Type names are permanent. A renamed type lists its old name in `aliases`;
//    stored strings are never rewritten.
// 2. Anchor forms are additive. A form the current build does not understand
//    is kept on the reference, which then points at the whole target.
// 3. Unknown types are valid references: `classifyRef` reports them as
//    `known: false` and they round-trip unchanged.
// 4. Adding a type is one `defineRefType` entry here, plus its link and
//    resolver. A test fixes the registered list.
//
// Pure (no React, no Prisma): usable on the client, server, worker and in tests.

import { decodeRefPart, encodeRefPart, isRefTypeName, type Ref } from "./ref-grammar";

export interface RefTypeDef<A = unknown> {
  /** Permanent once any reference of this type is stored. */
  type: string;
  label: string;
  /** Old names that still parse as this type. */
  aliases?: readonly string[];
  /** The anchor's meaning, or null when this form is not understood. */
  parseAnchor?: (anchor: string) => A | null;
  formatAnchor?: (anchor: A) => string;
}

/** What the registry keeps for lookups; typed anchor formatting stays with each definition. */
export type RegisteredRefType = {
  type: string;
  label: string;
  aliases: readonly string[];
  parseAnchor?: (anchor: string) => unknown;
};

export type ClassifiedRef =
  /** `anchor` is null when the reference points at the whole target. */
  | { known: true; ref: Ref; def: RegisteredRefType; anchor: unknown }
  /** A type this build does not know; keep the reference as it is. */
  | { known: false; ref: Ref };

export class RefTypeRegistry {
  private readonly byName = new Map<string, RegisteredRefType>();

  /** Registers a type; throws on an invalid name or a name already in use. */
  define<A>(def: RefTypeDef<A>): RefTypeDef<A> {
    const aliases = def.aliases ?? [];
    for (const name of [def.type, ...aliases]) {
      if (!isRefTypeName(name)) throw new Error(`Invalid reference type name "${name}"`);
      if (this.byName.has(name)) throw new Error(`Reference type "${name}" is already registered`);
    }
    if (new Set(aliases).size !== aliases.length || aliases.includes(def.type)) {
      throw new Error(`Reference type "${def.type}" repeats a name in its aliases`);
    }

    const entry: RegisteredRefType = { type: def.type, label: def.label, aliases, parseAnchor: def.parseAnchor };
    for (const name of [def.type, ...aliases]) this.byName.set(name, entry);
    return def;
  }

  /** The definition for a type name or one of its aliases. */
  get(type: string): RegisteredRefType | undefined {
    return this.byName.get(type);
  }

  /** Registered type names (not aliases), sorted. */
  list(): string[] {
    return [...new Set([...this.byName.values()].map((entry) => entry.type))].sort();
  }

  classify(ref: Ref): ClassifiedRef {
    const def = this.get(ref.type);
    if (!def) return { known: false, ref };
    const anchor = ref.anchor !== undefined && def.parseAnchor ? def.parseAnchor(ref.anchor) : null;
    return { known: true, ref, def, anchor: anchor ?? null };
  }
}

/** The registry every build uses; the v1 types below are registered on import. */
export const refTypes = new RefTypeRegistry();

export const defineRefType = <A>(def: RefTypeDef<A>) => refTypes.define(def);
export const getRefType = (type: string) => refTypes.get(type);
export const listRefTypes = () => refTypes.list();
export const classifyRef = (ref: Ref) => refTypes.classify(ref);

// ── v1 types ───────────────────────────────────────────────────────────────

const BLOCK_ID = /^b_[A-Za-z0-9_-]{10}$/;
const PAGE_ANCHOR = /^page([1-9][0-9]{0,8})$/;
const TIME_ANCHOR = /^t=(0|[1-9][0-9]{0,14})$/;

export type NoteAnchor = { blockId: string };
export type AssetAnchor = { kind: "page"; page: number } | { kind: "time"; ms: number };
export type WorkspaceAnchor = { nodeId: string };

/** `Note.id`; anchor `b_…` is a block id. */
export const noteRefType = defineRefType<NoteAnchor>({
  type: "note",
  label: "Note",
  parseAnchor: (anchor) => (BLOCK_ID.test(anchor) ? { blockId: anchor } : null),
  formatAnchor: ({ blockId }) => {
    if (!BLOCK_ID.test(blockId)) throw new RangeError(`Invalid block id "${blockId}"`);
    return blockId;
  },
});

/**
 * `MediaAsset.id`. PDF anchor `page<n>` (1-based). Video or audio anchor
 * `t=<ms>` in integer milliseconds, the unit of `video-anchor.startTimeMs`.
 */
export const assetRefType = defineRefType<AssetAnchor>({
  type: "asset",
  label: "Resource",
  parseAnchor: (anchor) => {
    const page = PAGE_ANCHOR.exec(anchor);
    if (page) return { kind: "page", page: Number(page[1]) };
    const time = TIME_ANCHOR.exec(anchor);
    if (time) {
      const ms = Number(time[1]);
      return Number.isSafeInteger(ms) ? { kind: "time", ms } : null;
    }
    return null;
  },
  formatAnchor: (anchor) => {
    if (anchor.kind === "page") {
      if (!Number.isInteger(anchor.page) || anchor.page < 1 || anchor.page > 999_999_999) {
        throw new RangeError(`Invalid page ${anchor.page}`);
      }
      return `page${anchor.page}`;
    }
    if (!Number.isSafeInteger(anchor.ms) || anchor.ms < 0) throw new RangeError(`Invalid time ${anchor.ms}`);
    return `t=${anchor.ms}`;
  },
});

/** `Workspace.id`; anchor is the id of a node to focus. */
export const workspaceRefType = defineRefType<WorkspaceAnchor>({
  type: "workspace",
  label: "Workspace",
  parseAnchor: (anchor) => {
    const nodeId = decodeRefPart(anchor);
    return nodeId && nodeId.length <= 128 ? { nodeId } : null;
  },
  formatAnchor: ({ nodeId }) => {
    if (nodeId.length === 0 || nodeId.length > 128) throw new RangeError("Invalid node id");
    return encodeRefPart(nodeId, "anchor");
  },
});

/** `Item.id` (a Shelf item); no anchors. */
export const itemRefType = defineRefType<never>({
  type: "item",
  label: "Shelf item",
});
