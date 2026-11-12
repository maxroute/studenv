// ---------------------------------------------------------------------------
// Resource cards – pure rules (no React/DOM)
// ---------------------------------------------------------------------------
// A resource card stands for a whole PDF, video, audio file or webpage on the
// canvas. The floating viewer never opens by itself: only tapping or clicking
// a card opens it.
// ---------------------------------------------------------------------------

import { ResourceCardKindSchema, type ResourceCardKind, type ResourceCardNode, type StudioItem, type WorkspaceViewport } from "@/types/workspace";

export const RESOURCE_CARD_SIZE = { w: 280, h: 88 } as const;
/** A press that moves further than this is a drag, not a tap that opens the card. */
export const RESOURCE_CARD_TAP_TOLERANCE_PX = 4;
/** A press held longer than this is not a tap (the long-press menu opens at 1 s). */
export const RESOURCE_CARD_TAP_MAX_MS = 500;

export type ResourceAsset = {
  id: string;
  kind: string;
  title?: string | null;
  sourceHost?: string | null;
};

/** The card kind for an asset kind, or null when the asset is not opened in the viewer (images, snapshots). */
export function resourceCardKind(assetKind: string): ResourceCardKind | null {
  const parsed = ResourceCardKindSchema.safeParse(assetKind);
  return parsed.success ? parsed.data : null;
}

/** Viewer used for a card: audio plays in the video viewer. */
export function viewerTypeForCard(kind: ResourceCardKind): "pdf" | "video" | "webpage" {
  return kind === "audio" ? "video" : kind;
}

/** Props for a new card, or null for assets that do not get a card. */
export function resourceCardProps(asset: ResourceAsset) {
  const kind = resourceCardKind(asset.kind);
  if (!kind || !asset.id) return null;
  return {
    assetId: asset.id,
    kind,
    title: asset.title?.trim() ?? "",
    ...(asset.sourceHost ? { sourceHost: asset.sourceHost } : {}),
    w: RESOURCE_CARD_SIZE.w,
    h: RESOURCE_CARD_SIZE.h,
  };
}

export function findResourceCard(items: readonly StudioItem[], assetId: string): ResourceCardNode | null {
  return items.find((item): item is ResourceCardNode => item.type === "resource-card" && item.props.assetId === assetId) ?? null;
}

/** Top-left world position that centres a card in the visible screen area. */
export function centeredCardPosition(viewport: WorkspaceViewport, screen: { w: number; h: number }) {
  const zoom = viewport.zoom > 0 ? viewport.zoom : 1;
  return {
    x: Math.round((screen.w / 2 - viewport.x) / zoom - RESOURCE_CARD_SIZE.w / 2),
    y: Math.round((screen.h / 2 - viewport.y) / zoom - RESOURCE_CARD_SIZE.h / 2),
  };
}

type PressPoint = { x: number; y: number; time: number };

/**
 * A short press released where it started opens the card; a drag or a held
 * press (long-press menu) does not. Decided from pointer events, because on
 * touch screens the drag library cancels `touchstart`, so iOS never sends a
 * `click` after a tap.
 */
export function isCardTap(start: PressPoint, end: PressPoint) {
  return (
    end.time - start.time <= RESOURCE_CARD_TAP_MAX_MS &&
    Math.hypot(end.x - start.x, end.y - start.y) <= RESOURCE_CARD_TAP_TOLERANCE_PX
  );
}

/** Shown under the title: the source host for webpages, otherwise the kind. */
export function resourceCardSubtitle(card: Pick<ResourceCardNode["props"], "kind" | "sourceHost">) {
  if (card.kind === "webpage") return card.sourceHost || "Web page";
  return card.kind === "pdf" ? "PDF" : card.kind === "video" ? "Video" : "Audio";
}
