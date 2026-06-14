import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ContentCoverageItem,
  ContentCoverageStatus,
  DocSection,
  EntityType,
  EventType,
  OntologyProperty,
  OntologySchema,
  RelationshipEdge,
  SourceDistribution,
} from "./types";

const ONTOLOGY_RULE_PATH = ".cursor/rules/ontology.mdc";
const CONTENT_DIR = "content";
const SOURCES_DIR = "src/sources";
const ONTOLOGY_ABOUT_PATH = "src/ontology/about.md";

type RawProperty = {
  name: string;
  type: string;
  format?: string;
  required?: boolean;
  items?: { type: string };
};

type RawEntityOrEvent = {
  name: string;
  description?: string;
  properties?: RawProperty[];
  doc_path?: string;
  template?: string;
};

type RawDocSection = {
  name: string;
  path: string;
  description?: string;
};

type RawOntologyYaml = {
  entity_types?: RawEntityOrEvent[];
  event_types?: RawEntityOrEvent[];
  doc_sections?: RawDocSection[];
};

/** Reads ontology.mdc and returns the parsed schema. */
export function loadOntologySchema(repoRoot = process.cwd()): OntologySchema {
  const rulePath = path.join(repoRoot, ONTOLOGY_RULE_PATH);
  const ruleContent = fs.readFileSync(rulePath, "utf8");
  const yamlBlock = extractYamlBlock(ruleContent);

  if (!yamlBlock) {
    throw new Error(`No YAML schema block found in ${ONTOLOGY_RULE_PATH}`);
  }

  const raw = parseYaml(yamlBlock) as RawOntologyYaml;
  const typeNames = collectTypeNames(raw);
  const referenceTargets = extractReferenceTargetsFromRawYaml(
    yamlBlock,
    typeNames,
  );

  const entityTypes: EntityType[] = (raw.entity_types ?? []).map((item) =>
    toEntityType(item, referenceTargets),
  );
  const eventTypes: EventType[] = (raw.event_types ?? []).map((item) =>
    toEventType(item, referenceTargets),
  );
  const docSections: DocSection[] = (raw.doc_sections ?? []).map((item) => ({
    name: item.name,
    category: "section" as const,
    path: item.path,
    description: item.description,
  }));

  const relationships = buildRelationships(entityTypes, eventTypes);

  return {
    entityTypes,
    eventTypes,
    docSections,
    relationships,
    allTypes: [...entityTypes, ...eventTypes, ...docSections],
  };
}

/** Compares ontology doc paths against files under content/. */
export function getContentCoverage(
  schema: OntologySchema,
  repoRoot = process.cwd(),
): ContentCoverageItem[] {
  const items: ContentCoverageItem[] = [];

  for (const type of [...schema.entityTypes, ...schema.eventTypes]) {
    items.push(
      buildCoverageItem(type.name, type.category, type.docPath, repoRoot),
    );
  }

  for (const section of schema.docSections) {
    items.push(
      buildCoverageItem(section.name, section.category, section.path, repoRoot),
    );
  }

  return items;
}

/** Reads optional human-readable ontology documentation. */
export function loadOntologyAbout(repoRoot = process.cwd()): string | null {
  const aboutPath = path.join(repoRoot, ONTOLOGY_ABOUT_PATH);
  if (!fs.existsSync(aboutPath)) {
    return null;
  }
  return fs.readFileSync(aboutPath, "utf8");
}

/** Summarizes how ingested sources map onto entity types. */
export function getSourceDistribution(
  schema: OntologySchema,
  repoRoot = process.cwd(),
): SourceDistribution {
  const sourceDirs = ["documents", "chats", "transcripts"] as const;
  const bySourceType: Record<string, number> = {
    document: 0,
    chat: 0,
    transcript: 0,
  };
  const entityMentions: Record<string, number> = {};

  for (const entityType of schema.entityTypes) {
    entityMentions[entityType.name] = 0;
  }

  let total = 0;

  for (const dir of sourceDirs) {
    const absoluteDir = path.join(repoRoot, SOURCES_DIR, dir);
    if (!fs.existsSync(absoluteDir)) {
      continue;
    }

    const files = collectMarkdownFiles(absoluteDir);
    for (const filePath of files) {
      const frontmatter = parseSourceFrontmatter(filePath);
      if (!frontmatter) {
        continue;
      }

      total += 1;
      const sourceType = String(
        frontmatter.source_type ?? dir.replace(/s$/, ""),
      );
      bySourceType[sourceType] = (bySourceType[sourceType] ?? 0) + 1;

      for (const entityType of schema.entityTypes) {
        if (sourceMentionsEntity(frontmatter, entityType.name)) {
          entityMentions[entityType.name] += 1;
        }
      }
    }
  }

  return { total, bySourceType, entityMentions };
}

function extractYamlBlock(content: string): string | null {
  const match = content.match(/```yaml\s*([\s\S]*?)```/);
  return match?.[1]?.trim() ?? null;
}

function collectTypeNames(raw: RawOntologyYaml): string[] {
  const names = [
    ...(raw.entity_types ?? []).map((item) => item.name),
    ...(raw.event_types ?? []).map((item) => item.name),
  ];
  return names.filter(Boolean);
}

function toEntityType(
  item: RawEntityOrEvent,
  referenceTargets: Map<string, string>,
): EntityType {
  return {
    name: item.name,
    category: "entity",
    description: item.description,
    properties: (item.properties ?? []).map((property) =>
      toOntologyProperty(property, item.name, referenceTargets),
    ),
    docPath: item.doc_path ?? "",
    template: item.template,
  };
}

function toEventType(
  item: RawEntityOrEvent,
  referenceTargets: Map<string, string>,
): EventType {
  return {
    name: item.name,
    category: "event",
    description: item.description,
    properties: (item.properties ?? []).map((property) =>
      toOntologyProperty(property, item.name, referenceTargets),
    ),
    docPath: item.doc_path ?? "",
    template: item.template,
  };
}

function toOntologyProperty(
  property: RawProperty,
  typeName: string,
  referenceTargets: Map<string, string>,
): OntologyProperty {
  const key = `${typeName}.${property.name}`;
  const referenceTarget = referenceTargets.get(key);

  return {
    name: property.name,
    type: property.type,
    format: property.format,
    required: property.required,
    items: property.items,
    referenceTarget,
  };
}

/**
 * Parses inline YAML comments like `# to an Organization entity`
 * to infer reference targets for relationship edges.
 */
function extractReferenceTargetsFromRawYaml(
  rawYaml: string,
  typeNames: string[],
): Map<string, string> {
  const targets = new Map<string, string>();
  let currentType: string | null = null;

  const lines = rawYaml.split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const typeMatch = line.match(/^\s*-\s*name:\s*(\w+)\s*$/);
    if (typeMatch) {
      const candidate = typeMatch[1];
      if (typeNames.includes(candidate)) {
        currentType = candidate;
      }
      continue;
    }

    const referenceLine = line.match(/^\s*type:\s*reference\b(.*)$/);
    if (!referenceLine || !currentType) {
      continue;
    }

    const propertyName = findPropertyNameForLine(lines, lineIndex);
    if (!propertyName) {
      continue;
    }

    const comment = referenceLine[1] ?? "";
    const targetFromComment = parseTargetFromComment(comment, typeNames);
    const targetFromName = inferTargetFromPropertyName(propertyName, typeNames);
    const target = targetFromComment ?? targetFromName;

    if (target) {
      targets.set(`${currentType}.${propertyName}`, target);
    }
  }

  return targets;
}

function findPropertyNameForLine(
  lines: string[],
  referenceLineIndex: number,
): string | null {
  for (let i = referenceLineIndex; i >= 0; i -= 1) {
    const match = lines[i].match(/^\s*-\s*name:\s*(\w+)\s*$/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

function parseTargetFromComment(
  comment: string,
  typeNames: string[],
): string | null {
  const match = comment.match(/#\s*to\s+(?:an?\s+)?(\w+)/i);
  if (!match) {
    return null;
  }

  const candidate = match[1];
  const exact = typeNames.find(
    (name) => name.toLowerCase() === candidate.toLowerCase(),
  );
  if (exact) {
    return exact;
  }

  const singular = candidate.replace(/s$/i, "");
  return (
    typeNames.find((name) => name.toLowerCase() === singular.toLowerCase()) ??
    null
  );
}

function inferTargetFromPropertyName(
  propertyName: string,
  typeNames: string[],
): string | null {
  const normalized = propertyName.toLowerCase();
  const direct = typeNames.find((name) => name.toLowerCase() === normalized);
  if (direct) {
    return direct;
  }

  const singular = normalized.replace(/s$/, "");
  return typeNames.find((name) => name.toLowerCase() === singular) ?? null;
}

function buildRelationships(
  entityTypes: EntityType[],
  eventTypes: EventType[],
): RelationshipEdge[] {
  const allTypes = [...entityTypes, ...eventTypes];

  type RawRef = {
    fromType: string;
    toType: string;
    propertyName: string;
    isMany: boolean;
  };

  const rawRefs: RawRef[] = [];
  for (const type of allTypes) {
    for (const property of type.properties) {
      const isReference =
        property.type === "reference" ||
        (property.type === "array" && property.items?.type === "reference");

      if (!isReference || !property.referenceTarget) {
        continue;
      }

      rawRefs.push({
        fromType: type.name,
        toType: property.referenceTarget,
        propertyName: property.name,
        isMany: property.type === "array",
      });
    }
  }

  const edges: RelationshipEdge[] = [];
  const seen = new Set<string>();

  for (const ref of rawRefs) {
    const reciprocal = rawRefs.find(
      (other) =>
        other !== ref &&
        other.fromType === ref.toType &&
        other.toType === ref.fromType,
    );

    const pairKey = [ref.fromType, ref.toType].sort().join("↔");
    if (seen.has(pairKey)) {
      continue;
    }
    seen.add(pairKey);

    const sourceCardinality: "one" | "many" = ref.isMany ? "many" : "one";
    const targetCardinality: "one" | "many" = reciprocal?.isMany ? "many" : "one";
    const label = reciprocal
      ? `${ref.propertyName} / ${reciprocal.propertyName}`
      : ref.propertyName;

    edges.push({
      id: `${ref.fromType}-${ref.propertyName}-${ref.toType}`,
      sourceType: ref.fromType,
      targetType: ref.toType,
      propertyName: label,
      sourceProperty: ref.propertyName,
      targetProperty: reciprocal?.propertyName ?? null,
      sourceCardinality,
      targetCardinality,
    });
  }

  return edges;
}

function buildCoverageItem(
  typeName: string,
  category: ContentCoverageItem["category"],
  docPath: string,
  repoRoot: string,
): ContentCoverageItem {
  const normalizedPath = docPath.replace(/^content\/?/, "");
  const absolutePath = path.join(repoRoot, CONTENT_DIR, normalizedPath);
  const exists = fs.existsSync(absolutePath);
  const fileCount = exists ? countMdxFiles(absolutePath) : 0;
  const status = getCoverageStatus(exists, fileCount);

  return {
    typeName,
    category,
    docPath,
    exists,
    fileCount,
    status,
  };
}

function countMdxFiles(directoryPath: string): number {
  let count = 0;
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      count += countMdxFiles(entryPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".mdx")) {
      count += 1;
    }
  }

  return count;
}

function getCoverageStatus(
  exists: boolean,
  fileCount: number,
): ContentCoverageStatus {
  if (!exists) {
    return "missing";
  }

  if (fileCount === 0) {
    return "empty";
  }

  return "populated";
}

function collectMarkdownFiles(directoryPath: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(entryPath));
      continue;
    }

    if (
      entry.isFile() &&
      (entry.name.endsWith(".md") || entry.name.endsWith(".mdx"))
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

function parseSourceFrontmatter(
  filePath: string,
): Record<string, unknown> | null {
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) {
    return null;
  }

  try {
    return parseYaml(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sourceMentionsEntity(
  frontmatter: Record<string, unknown>,
  entityTypeName: string,
): boolean {
  const normalizedEntity = entityTypeName.toLowerCase();
  const people = normalizeFrontmatterList(frontmatter.people);
  const orgs = normalizeFrontmatterList(frontmatter.orgs);

  if (normalizedEntity === "person" && people.length > 0) {
    return true;
  }

  if (normalizedEntity === "organization" && orgs.length > 0) {
    return true;
  }

  const tags = normalizeFrontmatterList(frontmatter.tags);
  return tags.some((tag) => tag.toLowerCase().includes(normalizedEntity));
}

function normalizeFrontmatterList(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  return [String(value)];
}
