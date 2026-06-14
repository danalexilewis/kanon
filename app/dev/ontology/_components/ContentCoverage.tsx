import type { ContentCoverageItem } from "@/lib/dev/types";

type ContentCoverageProps = {
  items: ContentCoverageItem[];
};

const statusStyles: Record<ContentCoverageItem["status"], string> = {
  populated: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  empty: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  missing: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const statusLabels: Record<ContentCoverageItem["status"], string> = {
  populated: "Populated",
  empty: "Empty",
  missing: "Missing",
};

const statusDescriptions: Record<ContentCoverageItem["status"], string> = {
  populated: "Folder exists in content/ and has generated .mdx files from update-docs.",
  empty: "Folder exists but has no .mdx files yet — update-docs ran without output for this type.",
  missing: "No folder exists yet — run update-docs to generate content for this path.",
};

/** Compares ontology doc paths against generated content coverage. */
export function ContentCoverage({ items }: ContentCoverageProps) {
  const summary = {
    populated: items.filter((item) => item.status === "populated").length,
    empty: items.filter((item) => item.status === "empty").length,
    missing: items.filter((item) => item.status === "missing").length,
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <p>
          Compares each ontology <code className="rounded bg-muted px-1">doc_path</code> against
          what exists under <code className="rounded bg-muted px-1">content/</code>. Run{" "}
          <code className="rounded bg-muted px-1">update-docs</code> to generate content for
          missing or empty paths.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Populated" value={summary.populated} tone="populated" />
        <SummaryCard label="Empty" value={summary.empty} tone="empty" />
        <SummaryCard label="Missing" value={summary.missing} tone="missing" />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Status legend</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {(["populated", "empty", "missing"] as const).map((status) => (
            <li key={status} className="flex items-start gap-2">
              <span
                className={`mt-0.5 inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[status]}`}
              >
                {statusLabels[status]}
              </span>
              <span>{statusDescriptions[status]}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Doc path</th>
              <th className="px-4 py-3 font-medium">MDX files</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.category}-${item.typeName}`} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{item.typeName}</td>
                <td className="px-4 py-3 capitalize text-muted-foreground">{item.category}</td>
                <td className="px-4 py-3 font-mono text-xs">{item.docPath}</td>
                <td className="px-4 py-3">{item.fileCount}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[item.status]}`}
                  >
                    {statusLabels[item.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: ContentCoverageItem["status"];
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <span
        className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyles[tone]}`}
      >
        {statusLabels[tone]}
      </span>
    </div>
  );
}
