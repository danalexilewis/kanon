/**
 * Relationship handle construction and partner-aligned placement.
 * Handles are node-level edge anchors; Y position follows the connected node.
 * Design notes: ../GRAPH-ROUTING.md · Agent index: .cursor/rules/ontology-dev-tool.mdc
 */
import { Position, type Node } from "@xyflow/react";
import type {
  RelationshipEdge,
  SchemaHandle,
  SchemaNodeData,
  SchemaRelationshipHandle,
} from "@/lib/dev/types";

const EMPTY_HANDLES: SchemaNodeData["handles"] = {
  [Position.Top]: [],
  [Position.Right]: [],
  [Position.Bottom]: [],
  [Position.Left]: [],
};

/** Formats a property type for display in the node body. */
export function formatPropertyType(
  property: SchemaNodeData["properties"][number],
): string {
  if (property.type === "array" && property.items?.type) {
    return `${property.items.type}[]`;
  }
  if (property.format) {
    const short = property.format.includes("(")
      ? property.format.split("(")[0].trim()
      : property.format;
    return `${property.type} (${short})`;
  }
  return property.type;
}

/** Builds one source/target handle per relationship edge on this node. */
export function buildRelationshipHandles(
  typeName: string,
  relationships: RelationshipEdge[],
): {
  handles: SchemaNodeData["handles"];
  relationshipHandles: SchemaRelationshipHandle[];
} {
  const handles: SchemaNodeData["handles"] = {
    [Position.Top]: [],
    [Position.Right]: [],
    [Position.Bottom]: [],
    [Position.Left]: [],
  };
  const relationshipHandles: SchemaRelationshipHandle[] = [];
  let nextId = 1;

  for (const relationship of relationships) {
    if (relationship.sourceType === typeName) {
      const id = `${nextId++}` as SchemaRelationshipHandle["id"];
      const handle: SchemaRelationshipHandle = {
        id,
        numericId: Number(id),
        type: "source",
        relationshipId: relationship.id,
        partnerNodeId: relationship.targetType,
      };

      relationshipHandles.push(handle);
      handles[Position.Right]?.push({
        id,
        numericId: Number(id),
        type: "source",
      });
    }

    if (relationship.targetType === typeName) {
      const id = `${nextId++}` as SchemaRelationshipHandle["id"];
      const handle: SchemaRelationshipHandle = {
        id,
        numericId: Number(id),
        type: "target",
        relationshipId: relationship.id,
        partnerNodeId: relationship.sourceType,
      };

      relationshipHandles.push(handle);
      handles[Position.Left]?.push({
        id,
        numericId: Number(id),
        type: "target",
      });
    }
  }

  return { handles, relationshipHandles };
}

/** Resolves which side a handle sits on for libavoid pin direction. */
export function getHandlePosition(
  data: SchemaNodeData,
  handleId: string,
): Position | null {
  const handles = data.handles ?? EMPTY_HANDLES;

  for (const [position, sideHandles] of Object.entries(handles)) {
    if (sideHandles?.some((handle) => handle.id === handleId)) {
      return position as Position;
    }
  }

  return null;
}

/** Finds a relationship handle on a node by edge id and end type. */
export function getRelationshipHandleId(
  data: SchemaNodeData,
  relationshipId: string,
  type: SchemaRelationshipHandle["type"],
): string | undefined {
  return data.relationshipHandles.find(
    (handle) =>
      handle.relationshipId === relationshipId && handle.type === type,
  )?.id;
}

const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 24;
const MIN_BODY_HEIGHT = 32;
const SIDE_INSET = 18;
const MIN_HANDLE_GAP = 56;

/** Node body height from property count — shared with layout. */
export function schemaNodeHeight(propertyCount: number): number {
  return HEADER_HEIGHT + Math.max(propertyCount * ROW_HEIGHT, MIN_BODY_HEIGHT);
}

/** Vertical center of a node in flow coordinates. */
export function getFlowNodeCenterY(node: Node): number {
  const data = node.data as SchemaNodeData;
  const height =
    node.measured?.height ?? schemaNodeHeight(data.properties.length);
  return node.position.y + height / 2;
}

type HandleZone = {
  topMin: number;
  topMax: number;
};

function getHandleZone(propertyCount: number): HandleZone {
  const nodeHeight = schemaNodeHeight(propertyCount);
  return {
    topMin: HEADER_HEIGHT + SIDE_INSET,
    topMax: nodeHeight - SIDE_INSET,
  };
}

type HandlePlacement = {
  handle: SchemaRelationshipHandle;
  idealTop: number;
};

/** Separates handles that crowd the same Y while staying inside the node. */
function resolveHandleCollisions(
  placements: HandlePlacement[],
  zone: HandleZone,
): Map<string, number> {
  const positions = new Map<string, number>();

  if (placements.length === 0) {
    return positions;
  }

  if (placements.length === 1) {
    const only = placements[0];
    positions.set(
      only.handle.id,
      clamp(only.idealTop, zone.topMin, zone.topMax),
    );
    return positions;
  }

  const sorted = [...placements].sort(
    (left, right) => left.idealTop - right.idealTop,
  );
  const ideals = sorted.map((placement) =>
    clamp(placement.idealTop, zone.topMin, zone.topMax),
  );

  const idealsRange = ideals[ideals.length - 1] - ideals[0];
  const minSpan = MIN_HANDLE_GAP * (sorted.length - 1);
  const tops =
    idealsRange < minSpan
      ? spreadEvenlyInZone(sorted.length, zone)
      : nudgeApart(ideals, zone);

  sorted.forEach((placement, index) => {
    positions.set(
      placement.handle.id,
      clamp(tops[index], zone.topMin, zone.topMax),
    );
  });

  return positions;
}

/** Nudges ideal positions apart with forward and backward passes. */
function nudgeApart(ideals: number[], zone: HandleZone): number[] {
  const tops = [...ideals];

  for (let index = 1; index < tops.length; index += 1) {
    if (tops[index] - tops[index - 1] < MIN_HANDLE_GAP) {
      tops[index] = tops[index - 1] + MIN_HANDLE_GAP;
    }
  }

  for (let index = tops.length - 2; index >= 0; index -= 1) {
    if (tops[index + 1] - tops[index] < MIN_HANDLE_GAP) {
      tops[index] = tops[index + 1] - MIN_HANDLE_GAP;
    }
  }

  return shiftIntoZone(tops, zone);
}

/** Evenly spaces handles across the full side when partners align too closely. */
function spreadEvenlyInZone(count: number, zone: HandleZone): number[] {
  if (count === 1) {
    return [(zone.topMin + zone.topMax) / 2];
  }

  const span = zone.topMax - zone.topMin;
  const gap = Math.max(MIN_HANDLE_GAP, span / (count - 1));
  const usedSpan = gap * (count - 1);
  const start = zone.topMin + (span - usedSpan) / 2;

  return Array.from({ length: count }, (_, index) => start + index * gap);
}

/** Shifts a handle group to fit inside the zone without changing relative gaps. */
function shiftIntoZone(tops: number[], zone: HandleZone): number[] {
  const shifted = [...tops];
  const overflow = shifted[shifted.length - 1] - zone.topMax;

  if (overflow > 0) {
    for (let index = 0; index < shifted.length; index += 1) {
      shifted[index] -= overflow;
    }
  }

  const underflow = zone.topMin - shifted[0];
  if (underflow > 0) {
    for (let index = 0; index < shifted.length; index += 1) {
      shifted[index] += underflow;
    }
  }

  return shifted.map((top) => clamp(top, zone.topMin, zone.topMax));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Places each handle at the partner node's vertical center (node-relative Y),
 * with collision nudging when multiple handles share a side.
 */
export function computePartnerAlignedHandleTops(
  node: Node,
  allNodes: Node[],
): Map<string, number> {
  const data = node.data as SchemaNodeData;
  const nodeById = new Map(allNodes.map((entry) => [entry.id, entry]));
  const zone = getHandleZone(data.properties.length);
  const positions = new Map<string, number>();

  for (const type of ["source", "target"] as const) {
    const sideHandles = data.relationshipHandles.filter(
      (handle) => handle.type === type,
    );

    const placements: HandlePlacement[] = sideHandles.map((handle) => {
      const partner = nodeById.get(handle.partnerNodeId);
      const fallback = (zone.topMin + zone.topMax) / 2;

      if (!partner) {
        return { handle, idealTop: fallback };
      }

      const partnerCenterY = getFlowNodeCenterY(partner);
      return { handle, idealTop: partnerCenterY - node.position.y };
    });

    const resolved = resolveHandleCollisions(placements, zone);
    resolved.forEach((top, handleId) => {
      positions.set(handleId, top);
    });
  }

  return positions;
}

/** Stable signature for handle layout — used by libavoid shape invalidation. */
export function getHandleLayoutSignature(node: Node, allNodes: Node[]): string {
  const tops = computePartnerAlignedHandleTops(node, allNodes);

  return (node.data as SchemaNodeData).relationshipHandles
    .map((handle) => `${handle.id}:${tops.get(handle.id) ?? 0}`)
    .join("|");
}
