"use client";

import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useMemo } from "react";
import { StudioItem } from "@/types/workspace";

export function ConnectionsLayer() {
  const { items, connections, removeConnection } = useWorkspaceStore();

  const paths = useMemo(() => {
    return connections.map((conn) => {
      const fromNode = items.find((i) => i.id === conn.fromId);
      const toNode = items.find((i) => i.id === conn.toId);

      if (!fromNode || !toNode) return null;

      // Precise edge-to-edge calculation
      const getEdgePoint = (from: StudioItem, to: StudioItem, isEnd: boolean) => {
        const cx1 = from.x + from.w / 2;
        const cy1 = from.y + from.h / 2;
        const cx2 = to.x + to.w / 2;
        const cy2 = to.y + to.h / 2;

        const dx = cx2 - cx1;
        const dy = cy2 - cy1;
        
        if (dx === 0 && dy === 0) return { x: cx1, y: cy1 };

        const angle = Math.atan2(dy, dx);
        const absCos = Math.abs(Math.cos(angle));
        const absSin = Math.abs(Math.sin(angle));

        let distance;
        if ((from.w / 2) * absSin <= (from.h / 2) * absCos) {
            distance = (from.w / 2) / absCos;
        } else {
            distance = (from.h / 2) / absSin;
        }

        // For the end point, we subtract a tiny bit for the arrowhead tip (optional)
        // For the start point, we stay exactly on the edge.
        const offset = isEnd ? distance : distance;
        
        return {
            x: cx1 + Math.cos(angle) * offset,
            y: cy1 + Math.sin(angle) * offset
        };
      };

      const start = getEdgePoint(fromNode, toNode, false);
      const end = getEdgePoint(toNode, fromNode, true);

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Vector-based adaptive curve
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const curveIntensity = Math.min(dist * 0.3, 150);

      
      // Rotate the control point vectors slightly to create a smooth 'S' curve
      const bend = 0.4; // The "curveness" factor
      const cp1x = start.x + Math.cos(angle + bend) * curveIntensity;
      const cp1y = start.y + Math.sin(angle + bend) * curveIntensity;
      const cp2x = end.x - Math.cos(angle - bend) * curveIntensity;
      const cp2y = end.y - Math.sin(angle - bend) * curveIntensity;

      const d = `M ${start.x} ${start.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${end.x} ${end.y}`;




      return (
        <g key={conn.id} className="group/conn">
          <path
            d={d}
            stroke={conn.color || "#94a3b8"}
            strokeWidth="2"
            fill="none"
            markerEnd="url(#arrowhead)"
            className="pointer-events-auto cursor-pointer hover:stroke-red-400 hover:stroke-[3px] transition-all"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Remove this connection?")) {
                removeConnection(conn.id);
              }
            }}
          />
        </g>
      );
    });
  }, [items, connections]);

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M 0 0 L 8 4 L 0 8 Z" fill="#94a3b8" />
        </marker>
      </defs>
      {paths}
    </svg>
  );
}
