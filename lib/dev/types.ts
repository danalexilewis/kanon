/** Ontology category for schema types. */
export type OntologyCategory = "entity" | "event" | "section";

/** Parsed property from entity or event type definitions. */
export type OntologyProperty = {
  name: string;
  type: string;
  format?: string;
  required?: boolean;
  items?: { type: string };
  /** Inferred target type name for reference properties. */
  referenceTarget?: string;
};

/** Shared fields for entity and event ontology types. */
export type OntologyTypeBase = {
  name: string;
  category: OntologyCategory;
  description?: string;
  properties: OntologyProperty[];
  docPath: string;
  template?: string;
};

/** Entity type from ontology schema. */
export type EntityType = OntologyTypeBase & {
  category: "entity";
};

/** Event type from ontology schema. */
export type EventType = OntologyTypeBase & {
  category: "event";
};

/** Doc section from ontology schema. */
export type DocSection = {
  name: string;
  category: "section";
  path: string;
  description?: string;
};

/** Relationship edge between ontology types. */
export type RelationshipEdge = {
  id: string;
  sourceType: string;
  targetType: string;
  /** Display label for the edge. */
  propertyName: string;
  /** Property on the source type that holds this reference. */
  sourceProperty: string;
  /** Property on the target type that holds the back-reference (if any). */
  targetProperty: string | null;
  sourceCardinality: "one" | "many";
  targetCardinality: "one" | "many";
};

/** Full parsed ontology schema. */
export type OntologySchema = {
  entityTypes: EntityType[];
  eventTypes: EventType[];
  docSections: DocSection[];
  relationships: RelationshipEdge[];
  /** All navigable types (entities, events, sections). */
  allTypes: Array<EntityType | EventType | DocSection>;
};

/** Content coverage status for a doc path. */
export type ContentCoverageStatus = "populated" | "empty" | "missing";

/** Content coverage row for ontology doc paths. */
export type ContentCoverageItem = {
  typeName: string;
  category: OntologyCategory;
  docPath: string;
  exists: boolean;
  fileCount: number;
  status: ContentCoverageStatus;
};

/** Handle metadata for libavoid-compatible edge routing. */
export type SchemaHandle = {
  /** React Flow handle id — numeric string for libavoid pin mapping. */
  id: `${number}`;
  numericId: number;
  type: "source" | "target";
};

/** Per-relationship handle on a schema node. */
export type SchemaRelationshipHandle = {
  /** React Flow handle id — numeric string for libavoid pin mapping. */
  id: `${number}`;
  numericId: number;
  type: "source" | "target";
  relationshipId: string;
  /** Connected node id — used to align handle Y with the partner. */
  partnerNodeId: string;
};

/** React Flow node data for schema graph nodes. */
export type SchemaNodeData = {
  label: string;
  category: OntologyCategory;
  properties: OntologyProperty[];
  description?: string;
  /** Handles grouped by side for libavoid pin direction lookup. */
  handles: Partial<Record<"top" | "right" | "bottom" | "left", SchemaHandle[]>>;
  /** One handle per relationship edge touching this node. */
  relationshipHandles: SchemaRelationshipHandle[];
};

/** Source file distribution across the ontology. */
export type SourceDistribution = {
  total: number;
  bySourceType: Record<string, number>;
  entityMentions: Record<string, number>;
};
