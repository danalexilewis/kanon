---
schema: eddy-kb/document/v1
doc:
  id: 0a9f4c21-88d1-4b70-9e2a-6f1c0d3e4a5b
  title: Architecture
  kind: derivative
  status: draft
---

# Architecture

Kanon composes three layers. The knowledge core does not know about Cursor,
Claude, Gemini, Codex, or any other runtime.

1. **Sources** — Git checkouts or local directories with a `kanon.yml`.
   Markdown in declared roots is the source of truth.
2. **Indexes** — one QMD SQLite file per index, built from one or more
   sources. Rebuildable. Never synced through Git.
3. **Operations** — a never-rest contract (`search`, `get`, `status`,
   `listIndexes`) used by the CLI, the TypeScript API, and optional MCP.

## Access

A **project** is a named caller with a root path. **Grants** map a project
to index ids. Grants live only in machine config. A source repo cannot grant
itself roots, remotes, or index access.

The MCP process opens *only* the granted index files. A filtering bug in
QMD cannot see an ungranted index.

## Transports

| Caller | Transport | Principal |
| --- | --- | --- |
| Human operator | CLI → `createLocalClient` | `operator` (all configured indexes) |
| Agent | `kanon mcp --project <id>` | that project |
| In-process | TypeScript API | supplied by the host |

HTTP is deferred.

## Search modes

`lexical`, `semantic`, and `hybrid`. The mode actually used is returned on
every result. Offline, lexical still works; semantic/hybrid fail explicitly
or the caller chooses lexical.
