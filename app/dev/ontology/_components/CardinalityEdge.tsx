"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
  type XYPosition,
} from "@xyflow/react";

export type CardinalityEdgeData = {
  label: string;
  sourceCardinality: "one" | "many";
  targetCardinality: "one" | "many";
  highlighted?: boolean;
  /** Intermediate waypoints from libavoid, excluding source/target. */
  points?: XYPosition[];
};

/**
 * ER cardinality markers on the edge path — the only place one/many is rendered.
 * Handles are neutral node-border dots; change these icons to indicate cardinality.
 * See ../GRAPH-ROUTING.md.
 */

/** Crow's foot marker for "many" end of a relationship. */
function crowFootMarkerPath() {
  return "M12,0 L0,6 L12,12 M0,6 L12,6";
}

/** Single line marker for "one" end of a relationship. */
function oneMarkerPath() {
  return "M6,0 L6,12 M0,6 L12,6";
}

/** Builds an SVG path through routed waypoints or a smooth-step fallback. */
function buildRoutedPath(
  points: XYPosition[],
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition?: Parameters<typeof getSmoothStepPath>[0]["sourcePosition"],
  targetPosition?: Parameters<typeof getSmoothStepPath>[0]["targetPosition"],
): { path: string; labelX: number; labelY: number } {
  if (points.length > 0) {
    const allPoints = [
      { x: sourceX, y: sourceY },
      ...points,
      { x: targetX, y: targetY },
    ];

    let path = "";
    for (const point of allPoints) {
      const x = point.x.toFixed(2);
      const y = point.y.toFixed(2);
      path += path ? ` L ${x} ${y}` : `M ${x} ${y}`;
    }

    const midpointIndex = Math.floor(allPoints.length / 2);
    const labelPoint = allPoints[midpointIndex] ?? allPoints[0];

    return {
      path,
      labelX: labelPoint.x,
      labelY: labelPoint.y,
    };
  }

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    offset: 20,
    borderRadius: 0,
  });

  return { path, labelX, labelY };
}

/** ER-style edge with libavoid routing and crow's foot / one markers. */
export function CardinalityEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
}: EdgeProps) {
  const edgeData = data as CardinalityEdgeData | undefined;
  const sourceCard = edgeData?.sourceCardinality ?? "one";
  const targetCard = edgeData?.targetCardinality ?? "one";
  const highlighted = edgeData?.highlighted ?? false;
  const strokeColor = highlighted
    ? "var(--color-fd-primary)"
    : "var(--color-fd-muted-foreground)";
  const opacity = highlighted ? 1 : 0.35;
  const points = edgeData?.points ?? [];
  const { path: edgePath, labelX, labelY } = buildRoutedPath(
    points,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  );

  const startMarkerId = `er-start-${id}`;
  const endMarkerId = `er-end-${id}`;

  return (
    <>
      <defs>
        <marker
          id={startMarkerId}
          viewBox="0 0 12 12"
          refX={sourceCard === "many" ? 12 : 6}
          refY="6"
          markerWidth="12"
          markerHeight="12"
          orient="auto-start-reverse"
        >
          <path
            d={sourceCard === "many" ? crowFootMarkerPath() : oneMarkerPath()}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </marker>
        <marker
          id={endMarkerId}
          viewBox="0 0 12 12"
          refX={targetCard === "many" ? 12 : 6}
          refY="6"
          markerWidth="12"
          markerHeight="12"
          orient="auto"
        >
          <path
            d={targetCard === "many" ? crowFootMarkerPath() : oneMarkerPath()}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: strokeColor,
          opacity,
          strokeWidth: highlighted ? 2 : 1.5,
        }}
        markerStart={`url(#${startMarkerId})`}
        markerEnd={`url(#${endMarkerId})`}
      />
      {edgeData?.label ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded px-1.5 py-0.5 text-[10px]"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              zIndex: 1,
              backgroundColor: "var(--color-fd-background)",
              color: "var(--color-fd-muted-foreground)",
            }}
          >
            {edgeData.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
