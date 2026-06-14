import type {
  DocSection,
  EntityType,
  EventType,
  OntologySchema,
  OntologyTypeBase,
} from "@/lib/dev/types";

type SchemaType = EntityType | EventType | DocSection;

function isDocSection(type: SchemaType): type is DocSection {
  return type.category === "section";
}

function getIncomingRelationships(schema: OntologySchema, typeName: string) {
  return schema.relationships.filter((edge) => edge.targetType === typeName);
}

function getOutgoingRelationships(schema: OntologySchema, typeName: string) {
  return schema.relationships.filter((edge) => edge.sourceType === typeName);
}

function formatPropertyType(property: OntologyTypeBase["properties"][number]) {
  if (property.type === "array" && property.items?.type) {
    const suffix = property.items.type === "reference" ? "reference" : property.items.type;
    return `array<${suffix}>`;
  }

  if (property.type === "reference" && property.referenceTarget) {
    return `reference → ${property.referenceTarget}`;
  }

  if (property.format) {
    return `${property.type} (${property.format})`;
  }

  return property.type;
}

function formatCardinality(source: "one" | "many", target: "one" | "many") {
  return `${source}-to-${target}`;
}

type SchemaDetailPanelProps = {
  schema: OntologySchema;
  type: SchemaType;
  compact?: boolean;
};

/** Detail panel for a selected schema type shown in graph and inspector. */
export function SchemaDetailPanel({ schema, type, compact = false }: SchemaDetailPanelProps) {
  if (isDocSection(type)) {
    return <DocSectionDetail section={type} compact={compact} />;
  }

  return <TypeDetail schema={schema} type={type} compact={compact} />;
}

function DocSectionDetail({
  section,
  compact,
}: {
  section: DocSection;
  compact: boolean;
}) {
  return (
    <div>
      <header className={`${compact ? "mb-3" : "mb-4 border-b border-border pb-4"}`}>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Doc section</p>
        <h2 className={compact ? "text-lg font-semibold" : "text-2xl font-semibold"}>
          {section.name}
        </h2>
        {section.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
        ) : null}
      </header>
      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Path</dt>
          <dd className="font-mono text-xs break-all">{section.path}</dd>
        </div>
      </dl>
    </div>
  );
}

function TypeDetail({
  schema,
  type,
  compact,
}: {
  schema: OntologySchema;
  type: EntityType | EventType;
  compact: boolean;
}) {
  const incoming = getIncomingRelationships(schema, type.name);
  const outgoing = getOutgoingRelationships(schema, type.name);

  return (
    <div>
      <header className={`${compact ? "mb-3" : "mb-4 border-b border-border pb-4"}`}>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {type.category === "entity" ? "Entity type" : "Event type"}
        </p>
        <h2 className={compact ? "text-lg font-semibold" : "text-2xl font-semibold"}>
          {type.name}
        </h2>
        {type.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{type.description}</p>
        ) : null}
      </header>

      <dl className="mb-4 grid gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Doc path</dt>
          <dd className="font-mono text-xs break-all">{type.docPath || "—"}</dd>
        </div>
        {!compact ? (
          <div>
            <dt className="text-muted-foreground">Template</dt>
            <dd className="font-mono text-xs break-all">{type.template || "—"}</dd>
          </div>
        ) : null}
      </dl>

      <section className="mb-4">
        <h3 className="mb-2 text-sm font-semibold">Properties</h3>
        {type.properties.length === 0 ? (
          <p className="text-sm text-muted-foreground">No properties defined.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {type.properties.map((property) => (
              <li
                key={property.name}
                className="rounded-md border border-border px-2 py-1.5"
              >
                <span className="font-mono">{property.name}</span>
                <span className="text-muted-foreground"> — {formatPropertyType(property)}</span>
                {property.required ? (
                  <span className="ml-1 text-xs text-primary">required</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={compact ? "space-y-3" : "grid gap-4 md:grid-cols-2"}>
        <RelationshipList title="Outgoing" items={outgoing} direction="out" />
        <RelationshipList title="Incoming" items={incoming} direction="in" />
      </section>
    </div>
  );
}

function RelationshipList({
  title,
  items,
  direction,
}: {
  title: string;
  items: OntologySchema["relationships"];
  direction: "in" | "out";
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-border px-2 py-1.5">
              <span className="font-mono">{item.propertyName}</span>
              <span className="text-muted-foreground">
                {" "}
                ({formatCardinality(item.sourceCardinality, item.targetCardinality)}) —{" "}
                {direction === "out" ? item.targetType : item.sourceType}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
