import type { SourceDistribution } from "@/lib/dev/types";

type SourceDistributionProps = {
  distribution: SourceDistribution;
};

/** Shows how ingested sources map onto ontology entity types. */
export function SourceDistributionView({ distribution }: SourceDistributionProps) {
  if (distribution.total === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">No sources ingested yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Run the <code className="rounded bg-muted px-1">ingest</code> skill to populate{" "}
          <code className="rounded bg-muted px-1">src/sources/</code>. Once sources exist, this
          view shows how they distribute across your ontology entity types.
        </p>
      </div>
    );
  }

  const sourceTypeEntries = Object.entries(distribution.bySourceType).filter(
    ([, count]) => count > 0,
  );
  const entityEntries = Object.entries(distribution.entityMentions);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <p>
          Summarizes canonical sources under <code className="rounded bg-muted px-1">src/sources/</code>{" "}
          and how often they mention each entity type via frontmatter fields like{" "}
          <code className="rounded bg-muted px-1">people</code> and{" "}
          <code className="rounded bg-muted px-1">orgs</code>.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Total sources" value={distribution.total} />
        {sourceTypeEntries.map(([sourceType, count]) => (
          <SummaryCard key={sourceType} label={sourceType} value={count} />
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Entity type</th>
              <th className="px-4 py-3 font-medium">Sources mentioning</th>
              <th className="px-4 py-3 font-medium">Share of sources</th>
            </tr>
          </thead>
          <tbody>
            {entityEntries.map(([entityType, count]) => (
              <tr key={entityType} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{entityType}</td>
                <td className="px-4 py-3">{count}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {distribution.total > 0
                    ? `${Math.round((count / distribution.total) * 100)}%`
                    : "0%"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm capitalize text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
