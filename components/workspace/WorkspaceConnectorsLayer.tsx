"use client";

import { useMemo } from "react";
import type { StudioItem } from "@/types/workspace";
import { getConnectorAnchorPoint, getConnectorArrowHead, getConnectorPath } from "@/lib/workspace/connector-geometry";

interface WorkspaceConnectorsLayerProps {
  items: StudioItem[];
}

export function WorkspaceConnectorsLayer({ items }: WorkspaceConnectorsLayerProps) {
  const connectors = useMemo(() => {
    const nodes = new Map(items.filter((item) => item.type !== "connector").map((item) => [item.id, item]));
    return items.flatMap((item) => {
      if (item.type !== "connector") return [];
      const source = nodes.get(item.props.sourceId);
      const target = nodes.get(item.props.targetId);
      if (!source || !target) return [];
      const start = getConnectorAnchorPoint(source, item.props.sourceAnchor);
      const end = getConnectorAnchorPoint(target, item.props.targetAnchor);
      return [{
        id: item.id,
        path: getConnectorPath(start, end),
        arrow: getConnectorArrowHead(start, end, Math.max(7, item.props.strokeWidth * 4)),
        color: item.props.color,
        strokeWidth: item.props.strokeWidth,
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
        <g key={connector.id}>
          <path
            d={connector.path}
            fill="none"
            stroke={connector.color}
            strokeWidth={connector.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d={connector.arrow} fill={connector.color} />
        </g>
      ))}
    </svg>
  );
}
