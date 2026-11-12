import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceItem, parseWorkspaceScene, serializeWorkspaceScene, type StudioItem } from "@/types/workspace";
import { isConnectableWorkspaceItem } from "./connector-geometry";
import { usesOverlayOutlineOnly } from "./selection-frame";
import {
  RESOURCE_CARD_SIZE,
  centeredCardPosition,
  findResourceCard,
  isCardTap,
  resourceCardKind,
  resourceCardProps,
  resourceCardSubtitle,
  viewerTypeForCard,
} from "./resource-card";

test("PDFs, videos, audio and webpages get a card; images and snapshots do not", () => {
  assert.equal(resourceCardKind("pdf"), "pdf");
  assert.equal(resourceCardKind("video"), "video");
  assert.equal(resourceCardKind("audio"), "audio");
  assert.equal(resourceCardKind("webpage"), "webpage");
  assert.equal(resourceCardKind("image"), null);
  assert.equal(resourceCardKind("snapshot"), null);
  assert.equal(resourceCardProps({ id: "a", kind: "image" }), null);
  assert.equal(resourceCardProps({ id: "", kind: "pdf" }), null);
  assert.deepEqual(resourceCardProps({ id: "a", kind: "webpage", title: "  Docs ", sourceHost: "example.com" }), {
    assetId: "a",
    kind: "webpage",
    title: "Docs",
    sourceHost: "example.com",
    ...RESOURCE_CARD_SIZE,
  });
});

test("audio opens in the video viewer; subtitles name the kind or the site", () => {
  assert.equal(viewerTypeForCard("audio"), "video");
  assert.equal(viewerTypeForCard("pdf"), "pdf");
  assert.equal(resourceCardSubtitle({ kind: "webpage", sourceHost: "example.com" }), "example.com");
  assert.equal(resourceCardSubtitle({ kind: "webpage" }), "Web page");
  assert.equal(resourceCardSubtitle({ kind: "pdf" }), "PDF");
});

test("a card is saved and reloaded, including lock and group, and repaired legacy data keeps it", () => {
  const card = createWorkspaceItem("resource-card", { ...resourceCardProps({ id: "asset-1", kind: "pdf", title: "Notes" }), locked: true, groupId: "g" }, { id: "card", x: 10, y: 20, zIndex: 1 })!;
  assert.equal(card.type, "resource-card");
  const [reloaded] = parseWorkspaceScene(JSON.parse(serializeWorkspaceScene({ items: [card] }))).items;
  assert.deepEqual(reloaded, card);

  // A malformed sibling forces the per-node repair path.
  const repaired = parseWorkspaceScene({
    items: [
      { id: "card", type: "resource-card", x: 0, y: 0, w: 280, h: 88, zIndex: 1, props: { assetId: "asset-1", kind: "video", title: 5 } },
      { id: "bad", type: "resource-card", x: 0, y: 0, w: 280, h: 88, zIndex: "2", props: { assetId: "asset-2", kind: "image" } },
    ],
  }).items;
  assert.deepEqual(repaired.map((item) => item.id), ["card"], "an unusable card is dropped on its own");
  assert.equal(repaired[0].type === "resource-card" && repaired[0].props.title, "");
});

test("cards are connectable, outline-only, and found by asset", () => {
  const card = createWorkspaceItem("resource-card", resourceCardProps({ id: "asset-1", kind: "pdf" }), { id: "card", x: 0, y: 0, zIndex: 1 }) as StudioItem;
  assert.equal(isConnectableWorkspaceItem(card), true);
  assert.equal(usesOverlayOutlineOnly("resource-card"), true);
  assert.equal(findResourceCard([card], "asset-1")?.id, "card");
  assert.equal(findResourceCard([card], "asset-2"), null);
});

test("a new card is centred in the visible area at any zoom", () => {
  const center = (vp: { x: number; y: number; zoom: number }) => {
    const p = centeredCardPosition(vp, { w: 1000, h: 800 });
    return { x: (p.x + RESOURCE_CARD_SIZE.w / 2) * vp.zoom + vp.x, y: (p.y + RESOURCE_CARD_SIZE.h / 2) * vp.zoom + vp.y };
  };
  assert.deepEqual(center({ x: 0, y: 0, zoom: 1 }), { x: 500, y: 400 });
  assert.deepEqual(center({ x: -300, y: 120, zoom: 0.5 }), { x: 500, y: 400 });
});

test("only a short press that does not move opens the card", () => {
  const at = (x: number, y: number, time: number) => ({ x, y, time });
  assert.equal(isCardTap(at(10, 10, 0), at(13, 12, 120)), true, "tap");
  assert.equal(isCardTap(at(10, 10, 0), at(16, 10, 120)), false, "drag");
  assert.equal(isCardTap(at(10, 10, 0), at(10, 10, 1100)), false, "long-press (context menu)");
  assert.equal(isCardTap(at(10, 10, 0), at(10, 10, 500)), true, "limit is inclusive");
});
