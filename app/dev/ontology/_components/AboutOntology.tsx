import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EntityType, EventType, OntologySchema } from "@/lib/dev/types";

type AboutOntologyProps = {
  schema: OntologySchema;
  aboutMarkdown: string | null;
};

type SchemaType = EntityType | EventType;

/** About tab — ontology narrative and per-type descriptions. */
export function AboutOntology({ schema, aboutMarkdown }: AboutOntologyProps) {
  const graphTypes: SchemaType[] = [...schema.entityTypes, ...schema.eventTypes];

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">About this ontology</h2>
        {aboutMarkdown ? (
          <div className="prose prose-neutral dark:prose-invert mt-4 max-w-none text-sm">
            <Markdown remarkPlugins={[remarkGfm]}>{aboutMarkdown}</Markdown>
          </div>
        ) : (
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>
              Add narrative documentation at{" "}
              <code className="rounded bg-muted px-1">src/ontology/about.md</code> to explain
              your ontology&apos;s purpose, starting point, and how to extend it.
            </p>
            <p>
              Use the <code className="rounded bg-muted px-1">create-ontology</code> skill to
              refine the schema in{" "}
              <code className="rounded bg-muted px-1">.cursor/rules/ontology.mdc</code>.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Schema types</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Entity and event types shown in the schema graph, with descriptions from the ontology
          YAML.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {graphTypes.map((type) => (
                <tr key={type.name} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{type.name}</td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">
                    {type.category}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {type.description ?? "No description defined."}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
