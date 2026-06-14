/**
 * Nudges nodes when unrelated edges transit too close.
 * See ../GRAPH-ROUTING.md and .cursor/rules/ontology-dev-tool.mdc.
 */
import type { Edge, Node } from "@xyflow/react";
import type { SchemaNodeData } from "@/lib/dev/types";
import {
  computePartnerAlignedHandleTops,
  getFlowNodeCenterY,
  schemaNodeHeight,
} from "./schema-handles";

export const SCHEMA_NODE_WIDTH = 280;

/** Minimum gap between a routed edge segment and a non-endpoint node. */
export const TRANSIT_NODE_CLEARANCE = 52;

/** Extra padding when scaling clearance for label height. */
const LABEL_CLEARANCE = 16;

type Bounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerY: number;
};

type FlowPoint = {
  x: number;
  y: number;
};

type EdgePath = {
  edgeId: string;
  sourceId: string;
  targetId: string;
  points: FlowPoint[];
};

/** Axis-aligned bounds for a schema node in flow coordinates. */
export function getSchemaNodeBounds(
  node: Node,
  nodeWidth = SCHEMA_NODE_WIDTH,
): Bounds {
  const data = node.data as SchemaNodeData;
  const width = node.measured?.width ?? nodeWidth;
  const height =
    node.measured?.height ?? schemaNodeHeight(data.properties.length);

  return {
    left: node.position.x,
    right: node.position.x + width,
    top: node.position.y,
    bottom: node.position.y + height,
    centerY: node.position.y + height / 2,
  };
}

/** Handle center Y in flow coordinates (partner-aligned estimate). */
function getEstimatedHandleFlowY(
  node: Node,
  handleId: string | null | undefined,
  allNodes: Node[],
): number | null {
  if (!handleId) {
    return null;
  }

  const tops = computePartnerAlignedHandleTops(node, allNodes);
  const top = tops.get(handleId);
  if (top === undefined) {
    return null;
  }

  return node.position.y + top;
}

type HandleBounds = {
  id?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
};

type SchemaNodeLookup = {
  get: (nodeId: string) =>
    | {
        position: { x: number; y: number };
        internals: {
          handleBounds?: {
            source?: HandleBounds[] | null;
            target?: HandleBounds[] | null;
          };
        };
      }
    | undefined;
};

/** Handle center in flow coordinates from measured React Flow internals. */
function getMeasuredHandleFlowPoint(
  nodeId: string,
  handleId: string | null | undefined,
  nodeLookup: SchemaNodeLookup,
): FlowPoint | null {
  if (!handleId) {
    return null;
  }

  const internal = nodeLookup.get(nodeId);
  if (!internal) {
    return null;
  }

  const bounds =
    internal.internals.handleBounds?.source?.find(
      (handle) => handle.id === handleId,
    ) ??
    internal.internals.handleBounds?.target?.find(
      (handle) => handle.id === handleId,
    );

  if (!bounds) {
    return null;
  }

  return {
    x: internal.position.x + bounds.x + bounds.width / 2,
    y: internal.position.y + bounds.y + bounds.height / 2,
  };
}

/** Post-dagre clearance using estimated handle heights between endpoints. */
export function adjustTransitClearance(
  nodes: Node[],
  edges: Edge[],
  clearance = TRANSIT_NODE_CLEARANCE,
): Node[] {
  const offsets = computeTransitOffsetsFromEstimates(nodes, edges, clearance);
  return applyNodeOffsets(nodes, offsets);
}

/** Builds full edge polylines from libavoid waypoints and handle positions. */
export function buildRoutedEdgePaths(
  nodes: Node[],
  edges: Edge[],
  nodeLookup: SchemaNodeLookup,
): EdgePath[] {
  const paths: EdgePath[] = [];

  for (const edge of edges) {
    const sourcePoint = getMeasuredHandleFlowPoint(
      edge.source,
      edge.sourceHandle,
      nodeLookup,
    );
    const targetPoint = getMeasuredHandleFlowPoint(
      edge.target,
      edge.targetHandle,
      nodeLookup,
    );

    if (!sourcePoint || !targetPoint) {
      continue;
    }

    const waypoints =
      (edge.data as { points?: FlowPoint[] } | undefined)?.points ?? [];

    paths.push({
      edgeId: edge.id,
      sourceId: edge.source,
      targetId: edge.target,
      points: [sourcePoint, ...waypoints, targetPoint],
    });
  }

  return paths;
}

/** Post-route clearance from actual libavoid geometry. */
export function computeRouteClearanceOffsets(
  nodes: Node[],
  edgePaths: EdgePath[],
  clearance = TRANSIT_NODE_CLEARANCE,
): Map<string, number> {
  const offsets = new Map<string, number>();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const path of edgePaths) {
    const source = nodeById.get(path.sourceId);
    const target = nodeById.get(path.targetId);
    if (!source || !target) {
      continue;
    }

    const sourceBounds = getSchemaNodeBounds(source);
    const targetBounds = getSchemaNodeBounds(target);
    const corridorLeft = sourceBounds.right;
    const corridorRight = targetBounds.left;

    if (corridorRight <= corridorLeft) {
      continue;
    }

    for (let index = 0; index < path.points.length - 1; index += 1) {
      const start = path.points[index];
      const end = path.points[index + 1];

      if (!isHorizontalSegment(start, end)) {
        continue;
      }

      const segmentY = (start.y + end.y) / 2;
      const segmentLeft = Math.min(start.x, end.x);
      const segmentRight = Math.max(start.x, end.x);

      for (const node of nodes) {
        if (node.id === path.sourceId || node.id === path.targetId) {
          continue;
        }

        const bounds = getSchemaNodeBounds(node);
        if (
          bounds.right <= corridorLeft ||
          bounds.left >= corridorRight ||
          segmentRight <= bounds.left ||
          segmentLeft >= bounds.right
        ) {
          continue;
        }

        const push = computeVerticalPush(
          bounds,
          segmentY,
          clearance + LABEL_CLEARANCE,
        );
        mergeOffset(offsets, node.id, push);
      }
    }
  }

  return offsets;
}

function computeTransitOffsetsFromEstimates(
  nodes: Node[],
  edges: Edge[],
  clearance: number,
): Map<string, number> {
  const offsets = new Map<string, number>();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const edge of edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) {
      continue;
    }

    const sourceBounds = getSchemaNodeBounds(source);
    const targetBounds = getSchemaNodeBounds(target);
    const corridorLeft = sourceBounds.right;
    const corridorRight = targetBounds.left;

    if (corridorRight <= corridorLeft) {
      continue;
    }

    const sourceY =
      getEstimatedHandleFlowY(source, edge.sourceHandle, nodes) ??
      getFlowNodeCenterY(source);
    const targetY =
      getEstimatedHandleFlowY(target, edge.targetHandle, nodes) ??
      getFlowNodeCenterY(target);
    const transitY = (sourceY + targetY) / 2;

    for (const node of nodes) {
      if (node.id === edge.source || node.id === edge.target) {
        continue;
      }

      const bounds = getSchemaNodeBounds(node);
      if (bounds.right <= corridorLeft || bounds.left >= corridorRight) {
        continue;
      }

      const push = computeVerticalPush(bounds, transitY, clearance);
      mergeOffset(offsets, node.id, push);
    }
  }

  return offsets;
}

function isHorizontalSegment(start: FlowPoint, end: FlowPoint): boolean {
  return Math.abs(start.y - end.y) < 2 && Math.abs(start.x - end.x) > 2;
}

/**
 * Returns dy to move a node so a horizontal edge at lineY clears it.
 * Positive dy moves the node down.
 */
function computeVerticalPush(
  bounds: Bounds,
  lineY: number,
  clearance: number,
): number {
  const clearTop = bounds.top - clearance;
  const clearBottom = bounds.bottom + clearance;

  if (lineY < clearTop || lineY > clearBottom) {
    return 0;
  }

  const pushDown = lineY - bounds.top + clearance;
  const pushUp = lineY - bounds.bottom - clearance;

  if (pushDown <= Math.abs(pushUp)) {
    return pushDown;
  }

  return pushUp;
}

function mergeOffset(
  offsets: Map<string, number>,
  nodeId: string,
  push: number,
): void {
  if (push === 0) {
    return;
  }

  const existing = offsets.get(nodeId) ?? 0;

  if (Math.abs(push) > Math.abs(existing)) {
    offsets.set(nodeId, push);
  }
}

export function applyNodeOffsets(
  nodes: Node[],
  offsets: Map<string, number>,
): Node[] {
  if (offsets.size === 0) {
    return nodes;
  }

  return nodes.map((node) => {
    const dy = offsets.get(node.id) ?? 0;
    if (dy === 0) {
      return node;
    }

    return {
      ...node,
      position: {
        x: node.position.x,
        y: node.position.y + dy,
      },
    };
  });
}

export function hasClearanceOffsets(offsets: Map<string, number>): boolean {
  for (const value of offsets.values()) {
    if (value !== 0) {
      return true;
    }
  }

  return false;
}
