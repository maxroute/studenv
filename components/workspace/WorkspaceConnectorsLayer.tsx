"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ConnectorNode, StudioItem } from "@/types/workspace";
import { computeConnectorRoute, type ConnectorRoute } from "@/lib/workspace/connector-routing";
import {
  CONNECTOR_LABEL_FONT_SIZE,
  CONNECTOR_LABEL_LINE_HEIGHT,
  CONNECTOR_LABEL_MAX_WIDTH,
  getConnectorLabelLayout,
} from "@/lib/workspace/connector-label";
import { ConnectorGraphic } from "./ConnectorGraphic";

interface WorkspaceConnectorsLayerProps {
  items: StudioItem[];
}

type RoutedConnector = { item: ConnectorNode; route: ConnectorRoute };

const LABEL_COLOR = "#000000";

export function WorkspaceConnectorsLayer({ items }: WorkspaceConnectorsLayerProps) {
  const connectors = useMemo<RoutedConnector[]>(() => {
    const byId = new Map(items.map((item) => [item.id, item] as const));
    return items.flatMap((item) => {
      if (item.type !== "connector") return [];
      const { props } = item;
      const route = computeConnectorRoute({ mode: props.mode, source: props.source, target: props.target }, byId);
      return route ? [{ item, route }] : [];
    });
  }, [items]);

  // Label boxes are measured from the rendered text (layout px == world units
  // inside the transformed world layer) so the line cut matches the text.
  const labelRefs = useRef(new Map<string, HTMLDivElement>());
  const [labelSizes, setLabelSizes] = useState<Record<string, { w: number; h: number }>>({});
  const labelKey = connectors.map(({ item }) => `${item.id}:${item.props.label?.text ?? ""}`).join("|");

  useLayoutEffect(() => {
    const next: Record<string, { w: number; h: number }> = {};
    labelRefs.current.forEach((element, id) => {
      next[id] = { w: element.offsetWidth, h: element.offsetHeight };
    });
    setLabelSizes((previous) => {
      const same = Object.keys(next).length === Object.keys(previous).length &&
        Object.entries(next).every(([id, size]) => previous[id]?.w === size.w && previous[id]?.h === size.h);
      return same ? previous : next;
    });
  }, [labelKey]);

  if (connectors.length === 0) return null;

  const layouts = new Map(
    connectors.flatMap(({ item, route }) => {
      const label = item.props.label;
      const size = labelSizes[item.id];
      if (!label?.text || !size) return [];
      return [[item.id, getConnectorLabelLayout(route, label.offset, size)] as const];
    }),
  );

  return (
    <>
      <svg
        aria-label="Workspace connections"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        style={{ zIndex: 0 }}
      >
        <defs>
          {[...layouts.entries()].map(([id, layout]) => (
            // Even-odd cut-out: everything visible except the padded label box.
            <mask key={id} id={`connector-label-mask-${id}`} maskUnits="userSpaceOnUse" x={-1e5} y={-1e5} width={2e5} height={2e5}>
              <rect x={-1e5} y={-1e5} width={2e5} height={2e5} fill="white" />
              <rect x={layout.clip.x} y={layout.clip.y} width={layout.clip.w} height={layout.clip.h} fill="black" />
            </mask>
          ))}
        </defs>
        {connectors.map(({ item, route }) => (
          <g key={item.id} data-connector-id={item.id} data-connector-mode={item.props.mode}>
            <ConnectorGraphic
              route={route}
              style={item.props}
              maskId={layouts.has(item.id) ? `connector-label-mask-${item.id}` : undefined}
            />
          </g>
        ))}
      </svg>
      {connectors.map(({ item, route }) => {
        const label = item.props.label;
        if (!label?.text) return null;
        const layout = layouts.get(item.id) ?? getConnectorLabelLayout(route, label.offset, { w: 0, h: 0 });
        return (
          <div
            key={`label-${item.id}`}
            ref={(element) => {
              if (element) labelRefs.current.set(item.id, element);
              else labelRefs.current.delete(item.id);
            }}
            data-connector-label-id={item.id}
            className="pointer-events-none absolute whitespace-pre-wrap break-words text-center"
            style={{
              left: layout.center.x,
              top: layout.center.y,
              transform: "translate(-50%, -50%)",
              maxWidth: CONNECTOR_LABEL_MAX_WIDTH,
              width: "max-content",
              fontSize: CONNECTOR_LABEL_FONT_SIZE,
              lineHeight: CONNECTOR_LABEL_LINE_HEIGHT,
              color: LABEL_COLOR,
              zIndex: 0,
              // Hidden until measured so the first frame never shows an uncut line under text.
              visibility: layouts.has(item.id) ? "visible" : "hidden",
            }}
          >
            {label.text}
          </div>
        );
      })}
    </>
  );
}
