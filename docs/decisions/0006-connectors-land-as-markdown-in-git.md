# 0006. Connectors land as Markdown in Git

- Status: accepted
- Date: 2026-10-11

## Context

Teams keep knowledge in Google Drive, and later Dropbox and OneDrive. Kanon
indexes Git checkouts and local directories. We could index connector
content directly, or bring it into a source repository first.

## Decision

A connector's documents are converted to Markdown and committed to a
write-access source, then indexed like everything else.

- A connector is a pair of functions, `list` and `read`, behind
  `createConnector`. Today the only format is `markdown`; items without it
  are skipped as `unsupported_format`. Converters for docx, PDF and other
  formats can be added later without changing the pipeline.
- The repository is the ingest state. Each file records its upstream URI and
  revision in `doc.sources`. There is no separate database to drift.
- `doc.id` is a UUID v5 of the source id and the upstream URI, so renames
  upstream become renames in Git.
- Ingest works in a temporary worktree at the remote tip and pushes
  fast-forward only. The operator's checkout only moves by fast-forward.
- Only files carrying the connector's URI scheme under the job's target are
  updated or removed.

## Consequences

- Every device, agent and grant sees connector content through the same
  index and access rules as hand-written docs.
- History, review and rollback come from Git.
- Ingest needs a source with write access ([ADR 0007](./0007-write-access-is-probed.md)).
- Formats without a Markdown form are invisible until a converter exists.
