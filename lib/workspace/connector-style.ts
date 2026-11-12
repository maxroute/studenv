// ---------------------------------------------------------------------------
// Connector style editing — toolbar values, flip, last-used defaults
// ---------------------------------------------------------------------------
// Pure helpers behind the connector style toolbar (AFFiNE parity): the
// options it offers, the value shown for a mixed selection, flipping
// endpoint styles, and the last-used style that new connectors inherit.
// ---------------------------------------------------------------------------

import { z } from "zod";
import {
  ConnectorEndpointStyleSchema,
  ConnectorStrokeStyleSchema,
  DEFAULT_CONNECTOR_COLOR,
  DEFAULT_CONNECTOR_STROKE_WIDTH,
  type ConnectorNode,
} from "@/types/workspace";

/** AFFiNE connector line widths. */
export const CONNECTOR_STROKE_WIDTHS = [2, 4, 6, 8, 10, 12] as const;

/** Toolbar palette: the AFFiNE connector grey first, then Studenv's shape colours. */
export const CONNECTOR_COLORS = [
  DEFAULT_CONNECTOR_COLOR, "#1e1e1e", "#f43f5e", "#f97316", "#eab308",
  "#22c55e", "#06b6d4", "#6366f1", "#a855f7", "#ec4899",
] as const;

export const CONNECTOR_ENDPOINT_STYLES = ConnectorEndpointStyleSchema.options;

export type ConnectorStyle = Pick<
  ConnectorNode["props"],
  "color" | "strokeWidth" | "strokeStyle" | "frontEndpointStyle" | "rearEndpointStyle"
>;

/** Style of a new connector when nothing has been used yet (AFFiNE defaults). */
export const DEFAULT_CONNECTOR_STYLE: ConnectorStyle = {
  color: DEFAULT_CONNECTOR_COLOR,
  strokeWidth: DEFAULT_CONNECTOR_STROKE_WIDTH,
  strokeStyle: "solid",
  frontEndpointStyle: "none",
  rearEndpointStyle: "arrow",
};

const StoredStyleSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  strokeWidth: z.number().finite().min(1).max(12),
  strokeStyle: ConnectorStrokeStyleSchema,
  frontEndpointStyle: ConnectorEndpointStyleSchema,
  rearEndpointStyle: ConnectorEndpointStyleSchema,
}).partial();

/**
 * Value the toolbar shows for a selection: the most common one, ties going
 * to the first seen (AFFiNE `getMostCommonValue`). Undefined when empty.
 */
export function getMostCommonValue<T>(values: readonly T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: T | undefined;
  let bestCount = 0;
  // Map iteration follows first insertion, so ties keep the first-seen value.
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** Flip swaps the start and end styles only; the path stays where it is (AFFiNE). */
export function flipEndpointStyles(props: Pick<ConnectorStyle, "frontEndpointStyle" | "rearEndpointStyle">) {
  return { frontEndpointStyle: props.rearEndpointStyle, rearEndpointStyle: props.frontEndpointStyle };
}

/** Style stored by a previous session merged over the defaults; invalid fields are ignored. */
export function parseStoredConnectorStyle(raw: string | null): ConnectorStyle {
  if (!raw) return DEFAULT_CONNECTOR_STYLE;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return DEFAULT_CONNECTOR_STYLE;
  }
  if (!json || typeof json !== "object") return DEFAULT_CONNECTOR_STYLE;
  const style: ConnectorStyle = { ...DEFAULT_CONNECTOR_STYLE };
  const record = json as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_CONNECTOR_STYLE) as Array<keyof ConnectorStyle>) {
    const field = StoredStyleSchema.shape[key].safeParse(record[key]);
    if (field.success && field.data !== undefined) Object.assign(style, { [key]: field.data });
  }
  return style;
}

const LAST_STYLE_KEY = "studenv:connector:last-style";

/** Last-used connector style for new connectors (per browser, best effort). */
export function readLastConnectorStyle(): ConnectorStyle {
  try {
    return parseStoredConnectorStyle(typeof window !== "undefined" ? window.localStorage.getItem(LAST_STYLE_KEY) : null);
  } catch {
    return DEFAULT_CONNECTOR_STYLE;
  }
}

export function writeLastConnectorStyle(style: ConnectorStyle) {
  try {
    window.localStorage.setItem(LAST_STYLE_KEY, JSON.stringify(style));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); memory is optional.
  }
}
