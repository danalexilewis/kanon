"use client";

import { Handle, Position, useStore, type NodeProps } from "@xyflow/react";
import type { SchemaNodeData, SchemaRelationshipHandle } from "@/lib/dev/types";
import { computePartnerAlignedHandleTops, formatPropertyType } from "./schema-handles";

const headerStyles: Record<SchemaNodeData["category"], string> = {
  entity: "bg-indigo-500/20 text-indigo-800 dark:text-indigo-200 border-b border-indigo-500/30",
  event: "bg-amber-500/20 text-amber-800 dark:text-amber-200 border-b border-amber-500/30",
  section: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-b border-emerald-500/30",
};

const borderStyles: Record<SchemaNodeData["category"], string> = {
  entity: "border-indigo-500/50",
  event: "border-amber-500/50",
  section: "border-emerald-500/50",
};

const categoryLabels: Record<SchemaNodeData["category"], string> = {
  entity: "Entity",
  event: "Event",
  section: "Section",
};

/** ER-diagram style node with one handle per relationship on each side. */
export function SchemaNode({ id, data, selected }: NodeProps) {
  const nodes = useStore((state) => state.nodes);
  const nodeData = data as SchemaNodeData;
  const header = headerStyles[nodeData.category];
  const border = borderStyles[nodeData.category];
  const self = nodes.find((node) => node.id === id);
  const handleTops = self
    ? computePartnerAlignedHandleTops(self, nodes)
    : new Map<string, number>();

  return (
    <div
      className={`relative min-w-[240px] max-w-[300px] cursor-pointer overflow-visible rounded-lg border-2 shadow-md transition-shadow ${border} ${
        selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      }`}
    >
      <div className={`flex items-center justify-between gap-2 px-3 py-2 ${header}`}>
        <span className="font-semibold">{nodeData.label}</span>
        <span className="rounded bg-background/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide opacity-80">
          {categoryLabels[nodeData.category]}
        </span>
      </div>

      <div className="bg-background/95">
        {nodeData.properties.length === 0 ? (
          <div className="px-3 py-2 text-xs italic text-muted-foreground">
            No properties defined
          </div>
        ) : (
          nodeData.properties.map((property) => (
            <PropertyRow key={property.name} property={property} />
          ))
        )}
      </div>

      {nodeData.relationshipHandles.map((handle) => (
        <RelationshipHandle
          key={handle.id}
          handle={handle}
          rowTop={handleTops.get(handle.id) ?? 0}
        />
      ))}
    </div>
  );
}

type PropertyRowProps = {
  property: SchemaNodeData["properties"][number];
};

function PropertyRow({ property }: PropertyRowProps) {
  return (
    <div className="relative flex items-center justify-between gap-4 border-b border-border/50 px-3 py-1 last:border-b-0">
      <span className="text-xs text-foreground">
        {property.required ? (
          <span className="font-medium">{property.name}</span>
        ) : (
          property.name
        )}
      </span>
      <span className="whitespace-nowrap text-[11px] text-muted-foreground">
        {formatPropertyType(property)}
      </span>
    </div>
  );
}

type RelationshipHandleProps = {
  handle: SchemaRelationshipHandle;
  rowTop: number;
};

function RelationshipHandle({ handle, rowTop }: RelationshipHandleProps) {
  const isSource = handle.type === "source";

  return (
    <Handle
      type={handle.type}
      position={isSource ? Position.Right : Position.Left}
      id={handle.id}
      style={isSource ? { top: rowTop, right: -8 } : { top: rowTop, left: -8 }}
      className="!absolute !h-2 !w-2 !rounded-full !border-0 !bg-muted-foreground"
    />
  );
}
