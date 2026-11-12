"use client";

import type { ConnectorEndpointStyle, ConnectorStrokeStyle } from "@/types/workspace";
import type { ConnectorRoute } from "@/lib/workspace/connector-routing";
import { getEndDirections, getEndpointShape, routeToSvgPath } from "@/lib/workspace/connector-path";

export type ConnectorGraphicStyle = {
  color: string;
  strokeWidth: number;
  strokeStyle: ConnectorStrokeStyle;
  frontEndpointStyle: ConnectorEndpointStyle;
  rearEndpointStyle: ConnectorEndpointStyle;
};

/**
 * SVG for one connector: the path (straight / elbow / curve), dash pattern
 * and both endpoint markers. Shared by persisted connectors and live
 * previews so both render identically.
 */
export function ConnectorGraphic({
  route,
  style,
  maskId,
  opacity,
}: {
  route: ConnectorRoute;
  style: ConnectorGraphicStyle;
  /** Mask that cuts the line around a label. Markers are not masked. */
  maskId?: string;
  opacity?: number;
}) {
  const directions = getEndDirections(route);
  const first = route.points[0];
  const last = route.points[route.points.length - 1];
  const front = getEndpointShape(style.frontEndpointStyle, first, directions.start, style.strokeWidth);
  const rear = getEndpointShape(style.rearEndpointStyle, last, directions.end, style.strokeWidth);

  return (
    <g opacity={opacity}>
      <path
        d={routeToSvgPath(route)}
        fill="none"
        stroke={style.color}
        strokeWidth={style.strokeWidth}
        // AFFiNE dashes connectors with a fixed [12, 12] pattern.
        strokeDasharray={style.strokeStyle === "dash" ? "12 12" : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
        mask={maskId ? `url(#${maskId})` : undefined}
      />
      {[front, rear].map((shape, index) => shape && (
        <path
          key={index}
          d={shape.d}
          fill={shape.filled ? style.color : "none"}
          stroke={style.color}
          strokeWidth={style.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}
