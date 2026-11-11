"use client";

import { useMemo } from "react";
import type { StudioItem } from "@/types/workspace";
import { computeConnectorRoute } from "@/lib/workspace/connector-routing";
import { getEndDirections, getEndpointShape, routeToSvgPath, type EndpointShape } from "@/lib/workspace/connector-path";

interface WorkspaceConnectorsLayerProps {
  items: StudioItem[];
}

type RenderedConnector = {
  id: string;
  path: string;
  color: string;
  strokeWidth: number;
  dash: string | undefined;
  front: EndpointShape | null;
  rear: EndpointShape | null;
};

export function WorkspaceConnectorsLayer({ items }: WorkspaceConnectorsLayerProps) {
  const connectors = useMemo<RenderedConnector[]>(() => {
    const byId = new Map(items.map((item) => [item.id, item] as const));
    return items.flatMap((item) => {
      if (item.type !== "connector") return [];
      const { props } = item;
      const route = computeConnectorRoute({ mode: props.mode, source: props.source, target: props.target }, byId);
      if (!route) return [];
      const directions = getEndDirections(route);
      const first = route.points[0];
      const last = route.points[route.points.length - 1];
      return [{
        id: item.id,
        path: routeToSvgPath(route),
        color: props.color,
        strokeWidth: props.strokeWidth,
        // AFFiNE dashes connectors with a fixed [12, 12] pattern.
        dash: props.strokeStyle === "dash" ? "12 12" : undefined,
        front: getEndpointShape(props.frontEndpointStyle, first, directions.start, props.strokeWidth),
        rear: getEndpointShape(props.rearEndpointStyle, last, directions.end, props.strokeWidth),
      }];
    });
  }, [items]);

  if (connectors.length === 0) return null;

  return (
    <svg
      aria-label="Workspace connections"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      style={{ zIndex: 0 }}
    >
      {connectors.map((connector) => (
        <g key={connector.id} data-connector-id={connector.id}>
          <path
            d={connector.path}
            fill="none"
            stroke={connector.color}
            strokeWidth={connector.strokeWidth}
            strokeDasharray={connector.dash}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {[connector.front, connector.rear].map((shape, index) => shape && (
            <path
              key={index}
              d={shape.d}
              fill={shape.filled ? connector.color : "none"}
              stroke={connector.color}
              strokeWidth={connector.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>
      ))}
    </svg>
  );
}
