"use client";

import type { ConnectorMode, StudioItem } from "@/types/workspace";
import { computeConnectorRoute } from "@/lib/workspace/connector-routing";
import { useConnectorUiStore } from "@/lib/workspace/connector-ui-store";
import { ConnectorGraphic } from "../ConnectorGraphic";
import { ConnectionOverlay } from "../ConnectionOverlay";
import type { ConnectionDraft } from "./useConnectionGesture";

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
  // Drawn with the last-used style the connector will be saved with.
  const style = useConnectorUiStore((state) => state.style);
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
          <ConnectorGraphic route={route} style={style} />
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
