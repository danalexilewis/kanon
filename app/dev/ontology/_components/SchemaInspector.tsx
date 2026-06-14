"use client";

import { useMemo, useState } from "react";
import type { EntityType, EventType, OntologySchema } from "@/lib/dev/types";
import { SchemaDetailPanel } from "./SchemaDetailPanel";

type SchemaType = EntityType | EventType;

type SchemaInspectorProps = {
  schema: OntologySchema;
  selectedTypeId: string | null;
  onSelectType: (typeId: string | null) => void;
};

/** Inspector for entity and event types shown in the schema graph. */
export function SchemaInspector({
  schema,
  selectedTypeId,
  onSelectType,
}: SchemaInspectorProps) {
  const [query, setQuery] = useState("");

  const graphTypes: SchemaType[] = useMemo(
    () => [...schema.entityTypes, ...schema.eventTypes],
    [schema.entityTypes, schema.eventTypes],
  );

  const filteredTypes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return graphTypes;
    }

    return graphTypes.filter((type) => {
      if (type.name.toLowerCase().includes(normalized)) {
        return true;
      }

      if (type.description?.toLowerCase().includes(normalized)) {
        return true;
      }

      return type.properties.some(
        (property) =>
          property.name.toLowerCase().includes(normalized) ||
          property.type.toLowerCase().includes(normalized),
      );
    });
  }, [graphTypes, query]);

  const selectedType =
    graphTypes.find((type) => type.name === selectedTypeId) ?? null;

  const groupedTypes = useMemo(() => {
    return {
      entity: filteredTypes.filter((type) => type.category === "entity"),
      event: filteredTypes.filter((type) => type.category === "event"),
    };
  }, [filteredTypes]);

  return (
    <div className="grid h-[calc(100vh-12rem)] min-h-[420px] grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="flex flex-col rounded-lg border border-border bg-card">
        <div className="border-b border-border p-3">
          <label htmlFor="schema-search" className="sr-only">
            Search schema types
          </label>
          <input
            id="schema-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search types or properties…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {(["entity", "event"] as const).map((category) => {
            const types = groupedTypes[category];
            if (types.length === 0) {
              return null;
            }

            return (
              <section key={category} className="mb-4">
                <h3 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {category === "entity" ? "Entities" : "Events"}
                </h3>
                <ul className="space-y-1">
                  {types.map((type) => (
                    <li key={type.name}>
                      <button
                        type="button"
                        onClick={() => onSelectType(type.name)}
                        className={`w-full rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted ${
                          selectedTypeId === type.name
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-foreground"
                        }`}
                      >
                        {type.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </aside>

      <section className="overflow-y-auto rounded-lg border border-border bg-card p-4">
        {!selectedType ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a type from the schema graph to inspect its properties and relationships.
          </div>
        ) : (
          <SchemaDetailPanel schema={schema} type={selectedType} />
        )}
      </section>
    </div>
  );
}
