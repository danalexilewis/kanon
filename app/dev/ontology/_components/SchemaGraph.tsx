"use client";

import { useEffect } from "react";
import dagre from "dagre";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { OntologySchema, SchemaNodeData } from "@/lib/dev/types";
import { CardinalityEdge } from "./CardinalityEdge";
import { SchemaNode } from "./SchemaNode";
import {
  buildRelationshipHandles,
  getRelationshipHandleId,
  schemaNodeHeight,
} from "./schema-handles";
import { adjustTransitClearance } from "./graph-clearance";
import { useLibavoid } from "./useLibavoid";

const nodeTypes = { schemaNode: SchemaNode };
const edgeTypes = { cardinality: CardinalityEdge };
const NODE_WIDTH = 280;
const HANDLE_OVERFLOW = 16;

function nodeHeight(propertyCount: number): number {
  return schemaNodeHeight(propertyCount);
}

type SchemaGraphProps = {
  schema: OntologySchema;
  selectedTypeId: string | null;
  onSelectType: (typeId: string | null) => void;
};

/** Dagre auto-layout for schema graph nodes. */
function layoutGraph(nodes: Node[], edges: Edge[]) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 140, ranksep: 280 });

  for (const node of nodes) {
    const nodeData = node.data as SchemaNodeData;
    const propCount = nodeData.properties.length;
    graph.setNode(node.id, {
      width: NODE_WIDTH + HANDLE_OVERFLOW * 2,
      height: nodeHeight(propCount),
    });
  }

  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  return nodes.map((node) => {
    const position = graph.node(node.id);
    const nodeData = node.data as SchemaNodeData;
    const height = nodeHeight(nodeData.properties.length);
    return {
      ...node,
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - height / 2,
      },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    };
  });
}

/** Builds React Flow nodes and edges from the ontology schema. */
function buildGraphElements(
  schema: OntologySchema,
  selectedTypeId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const graphTypes = [...schema.entityTypes, ...schema.eventTypes];
  const connectedIds = new Set<string>();

  if (selectedTypeId) {
    connectedIds.add(selectedTypeId);
    for (const edge of schema.relationships) {
      if (edge.sourceType === selectedTypeId || edge.targetType === selectedTypeId) {
        connectedIds.add(edge.sourceType);
        connectedIds.add(edge.targetType);
      }
    }
  }

  const nodes: Node[] = graphTypes.map((type) => {
    const isDimmed = selectedTypeId !== null && !connectedIds.has(type.name);
    const { handles, relationshipHandles } = buildRelationshipHandles(
      type.name,
      schema.relationships,
    );

    return {
      id: type.name,
      type: "schemaNode",
      position: { x: 0, y: 0 },
      data: {
        label: type.name,
        category: type.category,
        properties: type.properties,
        description: type.description,
        handles,
        relationshipHandles,
      } satisfies SchemaNodeData,
      className: `cursor-pointer ${isDimmed ? "opacity-35" : "opacity-100"}`,
    };
  });

  const nodeDataById = new Map(
    nodes.map((node) => [node.id, node.data as SchemaNodeData]),
  );

  const edges: Edge[] = [];

  for (const relationship of schema.relationships) {
    const sourceData = nodeDataById.get(relationship.sourceType);
    const targetData = nodeDataById.get(relationship.targetType);

    if (!sourceData || !targetData) {
      continue;
    }

    const sourceHandle = getRelationshipHandleId(
      sourceData,
      relationship.id,
      "source",
    );
    const targetHandle = getRelationshipHandleId(
      targetData,
      relationship.id,
      "target",
    );

    if (!sourceHandle || !targetHandle) {
      continue;
    }

    const isHighlighted =
      selectedTypeId === null ||
      relationship.sourceType === selectedTypeId ||
      relationship.targetType === selectedTypeId;

    edges.push({
      id: relationship.id,
      type: "cardinality",
      source: relationship.sourceType,
      target: relationship.targetType,
      sourceHandle,
      targetHandle,
      animated: isHighlighted && selectedTypeId !== null,
      data: {
        label: relationship.propertyName,
        sourceCardinality: relationship.sourceCardinality,
        targetCardinality: relationship.targetCardinality,
        highlighted: isHighlighted,
        points: [],
      },
    });
  }

  const laidOut = layoutGraph(nodes, edges);
  const cleared = adjustTransitClearance(laidOut, edges);

  return { nodes: cleared, edges };
}

/** Inner graph that runs libavoid routing inside ReactFlowProvider. */
function SchemaGraphCanvas({
  schema,
  selectedTypeId,
  onSelectType,
}: SchemaGraphProps) {
  const layoutKey = `${schema.relationships.map((r) => r.id).join(",")}:${selectedTypeId ?? "all"}`;
  const initialElements = buildGraphElements(schema, selectedTypeId);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialElements.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialElements.edges);

  useLibavoid({ layoutKey, setNodes });

  useEffect(() => {
    const { nodes: nextNodes, edges: nextEdges } = buildGraphElements(
      schema,
      selectedTypeId,
    );
    setNodes(nextNodes);
    setEdges(nextEdges);
  }, [schema, selectedTypeId, setNodes, setEdges]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onSelectType(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSelectType]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      nodesDraggable
      onNodeClick={(_, node) => onSelectType(node.id)}
      onPaneClick={() => onSelectType(null)}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={16} size={1} />
    </ReactFlow>
  );
}

/** Interactive schema graph with relationship-aware handles. */
export function SchemaGraph(props: SchemaGraphProps) {
  return (
    <div className="h-[calc(100vh-12rem)] min-h-[420px] w-full rounded-lg border border-border bg-background">
      <ReactFlowProvider>
        <SchemaGraphCanvas {...props} />
      </ReactFlowProvider>
    </div>
  );
}
