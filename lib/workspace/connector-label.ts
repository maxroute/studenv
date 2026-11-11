// ---------------------------------------------------------------------------
// Connector label layout — position along the path and the line cut-out
// ---------------------------------------------------------------------------

import type { Vec } from "./connector-anchors";
import type { ConnectorRoute } from "./connector-routing";
import { getPointAtOffset } from "./connector-path";

/** AFFiNE wraps connector labels at 280 world units. */
export const CONNECTOR_LABEL_MAX_WIDTH = 280;
export const CONNECTOR_LABEL_FONT_SIZE = 16;
export const CONNECTOR_LABEL_LINE_HEIGHT = 1.2;
/** Gap kept clear around the label where the line is cut (AFFiNE: 3 + 0.5). */
export const CONNECTOR_LABEL_CLIP_PADDING = 3.5;

export type LabelRect = { x: number; y: number; w: number; h: number };

/**
 * Label box centred on the point at `offset` (0..1) along the route, plus the
 * padded rectangle where the connector line is hidden.
 */
export function getConnectorLabelLayout(
  route: ConnectorRoute,
  offset: number,
  size: { w: number; h: number },
): { center: Vec; rect: LabelRect; clip: LabelRect } {
  const center = getPointAtOffset(route, offset);
  const rect = { x: center.x - size.w / 2, y: center.y - size.h / 2, w: size.w, h: size.h };
  const pad = CONNECTOR_LABEL_CLIP_PADDING;
  return { center, rect, clip: { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 } };
}
