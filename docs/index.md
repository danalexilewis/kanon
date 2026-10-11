---
schema: eddy-kb/document/v1
doc:
  id: 7c1d2e90-3b5a-4f11-9c0d-1a2b3c4d5e6f
  title: Kanon documentation
  kind: derivative
  status: draft
---

# Kanon documentation

These pages describe the **current** Kanon v2 tree. They are not a spec.
Update them when the code changes.

| Doc | Topic |
| --- | --- |
| [Architecture](./architecture.md) | Sources, indexes, grants, contracts |
| [Threat model](./threat-model.md) | What is trusted |
| [Source manifest](./standard/source-manifest.md) | `kanon.yml` |
| [Document format](./standard/document-format.md) | `doc` / `vars` frontmatter |
| [Machine config](./standard/machine-config.md) | Sources, indexes, projects, grants, connectors, ingest |
| [Add a source](./guides/add-a-source.md) | Operator workflow |
| [Search](./guides/search.md) | CLI search and get |
| [MCP](./guides/mcp.md) | Agent access |
| [Scheduled jobs](./guides/scheduled-jobs.md) | `kanon tick`, refresh, ingest, scheduler |
| [Google Drive](./guides/google-drive.md) | Connector setup and ingest jobs |
| [Multiple devices](./guides/multiple-devices.md) | Device identity, assignment, chezmoi |
| [Decisions](./decisions/0001-rewrite-in-place.md) | ADRs |
| [Review](./background/never-rest-local-knowledge-review-2026-10-11.md) | Source review |

Search this corpus with `pnpm docs:search "…"`.
