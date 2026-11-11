"use client";

import {
  DEFAULT_CONNECTOR_COLOR,
  DEFAULT_CONNECTOR_STROKE_WIDTH,
  type ConnectorMode,
  type StudioItem,
} from "@/types/workspace";
import { computeConnectorRoute } from "@/lib/workspace/connector-routing";
import { ConnectorGraphic, type ConnectorGraphicStyle } from "../ConnectorGraphic";
import { ConnectionOverlay } from "../ConnectionOverlay";
import type { ConnectionDraft } from "./useConnectionGesture";

/** Default appearance of a new connector (AFFiNE defaults). */
export const NEW_CONNECTOR_STYLE: ConnectorGraphicStyle = {
  color: DEFAULT_CONNECTOR_COLOR,
  strokeWidth: DEFAULT_CONNECTOR_STROKE_WIDTH,
  strokeStyle: "solid",
  frontEndpointStyle: "none",
  rearEndpointStyle: "arrow",
};

/**
 * The connector being created, drawn exactly as it will be saved, plus the
 * candidate anchors of the element under the pointer.
 */
export function ConnectorDraftPreview({
  draft,
  items,
  mode,
  zoom,
}: {
  draft: ConnectionDraft;
  items: readonly StudioItem[];
  mode: ConnectorMode;
  zoom: number;
}) {
  const route = computeConnectorRoute({ mode, source: draft.source, target: draft.target.end }, items);
  return (
    <svg
      aria-hidden="true"
      data-connector-draft="true"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      style={{ zIndex: 1200 }}
    >
      {route && (
        <g data-connector-preview="true">
          <ConnectorGraphic route={route} style={NEW_CONNECTOR_STYLE} />
        </g>
      )}
      <ConnectionOverlay
        anchors={draft.target.anchors}
        highlight={draft.target.kind === "free" ? null : draft.target.point}
        zoom={zoom}
      />
    </svg>
  );
}
