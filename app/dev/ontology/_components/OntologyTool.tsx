"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ContentCoverageItem, OntologySchema, SourceDistribution } from "@/lib/dev/types";
import { AboutOntology } from "./AboutOntology";
import { ContentCoverage } from "./ContentCoverage";
import { SchemaDetailPanel } from "./SchemaDetailPanel";
import { SchemaGraph } from "./SchemaGraph";
import { SourceDistributionView } from "./SourceDistribution";

type OntologyTab = "graph" | "coverage" | "sources" | "about";

type OntologyToolProps = {
  schema: OntologySchema;
  coverage: ContentCoverageItem[];
  sourceDistribution: SourceDistribution;
  aboutMarkdown: string | null;
};

const tabs: Array<{ id: OntologyTab; label: string; description: string }> = [
  { id: "graph", label: "Graph", description: "Interactive schema graph with type relationships" },
  { id: "coverage", label: "Coverage", description: "Ontology doc paths vs generated content" },
  { id: "sources", label: "Sources", description: "How src/sources/ maps onto the schema" },
  { id: "about", label: "About", description: "Ontology narrative and type descriptions" },
];

/** Dev-only shell for ontology visualization views. */
export function OntologyTool({
  schema,
  coverage,
  sourceDistribution,
  aboutMarkdown,
}: OntologyToolProps) {
  const [activeTab, setActiveTab] = useState<OntologyTab>("graph");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const graphTypes = useMemo(
    () => [...schema.entityTypes, ...schema.eventTypes],
    [schema.entityTypes, schema.eventTypes],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (isTyping) {
        return;
      }

      if (event.key === "Escape") {
        setSelectedTypeId(null);
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }

      event.preventDefault();
      const typeIds = graphTypes.map((type) => type.name);
      if (typeIds.length === 0) {
        return;
      }

      const currentIndex = selectedTypeId
        ? typeIds.indexOf(selectedTypeId)
        : event.key === "ArrowDown"
          ? -1
          : 0;
      const nextIndex =
        event.key === "ArrowDown"
          ? (currentIndex + 1) % typeIds.length
          : (currentIndex - 1 + typeIds.length) % typeIds.length;

      setSelectedTypeId(typeIds[nextIndex]);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [graphTypes, selectedTypeId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const isSmallScreen = window.matchMedia("(max-width: 1279px)").matches;
    if (selectedType && isSmallScreen) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [selectedTypeId]);

  const selectedType =
    graphTypes.find((type) => type.name === selectedTypeId) ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Dev only
              </p>
              <h1 className="text-2xl font-bold">Ontology explorer</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Read-only views of your schema in{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">.cursor/rules/ontology.mdc</code>
              </p>
            </div>
            <Link
              href="/"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Back to site
            </Link>
          </div>

          <nav aria-label="Ontology views">
            <div
              role="tablist"
              aria-orientation="horizontal"
              className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1"
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    id={`ontology-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`ontology-panel-${tab.id}`}
                    title={tab.description}
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {activeTab === "graph" ? (
          <div
            id="ontology-panel-graph"
            role="tabpanel"
            aria-labelledby="ontology-tab-graph"
            className="space-y-4"
          >
            <p className="text-xs text-muted-foreground">
              Click a node to highlight its neighborhood. Use arrow keys to move between schema
              types, Escape to clear selection.
            </p>
            <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
              <SchemaGraph
                schema={schema}
                selectedTypeId={selectedTypeId}
                onSelectType={setSelectedTypeId}
              />

              {/* Inline sidebar on xl+ screens */}
              <aside className="hidden max-h-[calc(100vh-12rem)] overflow-y-auto rounded-lg border border-border bg-card p-4 xl:block">
                <h2 className="text-sm font-semibold">Selection</h2>
                {!selectedType ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Click a node in the graph to inspect it here.
                  </p>
                ) : (
                  <div className="mt-3">
                    <SchemaDetailPanel schema={schema} type={selectedType} compact />
                  </div>
                )}
              </aside>

              {/* Dialog on smaller screens */}
              <dialog
                ref={dialogRef}
                onClick={(event) => {
                  if (event.target === event.currentTarget) {
                    setSelectedTypeId(null);
                  }
                }}
                onClose={() => setSelectedTypeId(null)}
                className="m-auto max-h-[85vh] w-full max-w-lg rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50 open:flex open:flex-col xl:hidden"
              >
                {selectedType ? (
                  <>
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <h2 className="text-sm font-semibold">{selectedType.name}</h2>
                      <button
                        type="button"
                        onClick={() => setSelectedTypeId(null)}
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Close"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                      <SchemaDetailPanel schema={schema} type={selectedType} compact />
                    </div>
                  </>
                ) : null}
              </dialog>
            </div>
          </div>
        ) : null}

        {activeTab === "coverage" ? (
          <div
            id="ontology-panel-coverage"
            role="tabpanel"
            aria-labelledby="ontology-tab-coverage"
          >
            <ContentCoverage items={coverage} />
          </div>
        ) : null}

        {activeTab === "sources" ? (
          <div
            id="ontology-panel-sources"
            role="tabpanel"
            aria-labelledby="ontology-tab-sources"
          >
            <SourceDistributionView distribution={sourceDistribution} />
          </div>
        ) : null}

        {activeTab === "about" ? (
          <div id="ontology-panel-about" role="tabpanel" aria-labelledby="ontology-tab-about">
            <AboutOntology schema={schema} aboutMarkdown={aboutMarkdown} />
          </div>
        ) : null}
      </main>
    </div>
  );
}
