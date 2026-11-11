"use client";

import { useMemo } from "react";
import type { StudioItem } from "@/types/workspace";
import { getConnectorAnchorPoint, getConnectorPath } from "@/lib/workspace/connector-geometry";

interface WorkspaceConnectorsLayerProps {
  items: StudioItem[];
}

export function WorkspaceConnectorsLayer({ items }: WorkspaceConnectorsLayerProps) {
  const paths = useMemo(() => {
    const byId = new Map(items.filter((item) => item.type !== "connector").map((item) => [item.id, item]));
    return items.flatMap((item) => {
      if (item.type !== "connector") return [];
      const source = byId.get(item.props.sourceId);
      const target = byId.get(item.props.targetId);
      if (!source || !target) return [];
      return [{
        id: item.id,
        d: getConnectorPath(
          getConnectorAnchorPoint(source, item.props.sourceAnchor),
          getConnectorAnchorPoint(target, item.props.targetAnchor),
        ),
        color: item.props.color,
        strokeWidth: item.props.strokeWidth,
      }];
    });
  }, [items]);

  if (paths.length === 0) return null;
  return (
    <svg
      aria-label="Workspace connections"
      className="absolute inset-0 h-full w-full overflow-visible pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <defs>
        <marker id="workspace-connector-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
        </marker>
      </defs>
      {paths.map((path) => (
        <path
          key={path.id}
          d={path.d}
          fill="none"
          stroke={path.color}
          strokeWidth={path.strokeWidth}
          strokeLinecap="round"
          markerEnd="url(#workspace-connector-arrow)"
        />
      ))}
    </svg>
  );
}
