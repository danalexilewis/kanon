---
Date: 2026-10-11
Status: Mostly done
Last updated: 2026-10-11
Applies to: Kanon v2 rewrite — local-first knowledge indexes
---

# Kanon v2 — local-first knowledge indexes

Rewrite Kanon in place as a standalone, agent-runtime-neutral knowledge tool.
Repositories become sources. QMD builds physically separate indexes. A
never-rest-backed CLI and optional MCP server enforce which project can read
which index.

This document describes the current plan. It is not a spec. Update it as the
implementation changes.

Background: [docs/background/never-rest-local-knowledge-review-2026-10-11.md](../docs/background/never-rest-local-knowledge-review-2026-10-11.md).

never-rest 0.7.0 (NR-01 to NR-07) is owned by another agent. This rewrite
consumes those APIs. The MCP adapter (NR-08) lives in never-rest as `./mcp`.

## Context

v1 was a Cursor-driven ELT pipeline that published a Fumadocs site. That
implementation is obsolete. Keep the useful distinction between original
material, normalized references and authored derivatives. Do not keep the
Next/Fumadocs app, editor hooks as required dependencies, or wholesale
regeneration of derivatives.

## Decisions

- Rewrite in place. Tag `v1-final`, keep `archive/v1`, then replace the tree.
- An index is the unit of access. Each index is its own QMD SQLite file.
- Grants live only in operator machine config (`$KANON_HOME` or
  `~/.config/kanon/`), never in a source or project repo.
- Local identity is a declared project ID checked against operator grants. It
  is not isolation from a hostile agent on the same OS account.
- Pin `@tobilu/qmd@2.8.3`. Never read or write the global `~/.config/qmd`.
- Kanon consumes never-rest 0.7.0 (`definePolicy` and `./mcp`), merged to
  never-rest `main`. npm still publishes 0.6.0, so this tree uses
  `file:../never-rest` until 0.7.0 is released.
- Docs describe the current state. Tests and a project-local QMD docs index
  grow with each slice.

## Deliverables

### K0 — Reset and scaffold

- [x] Tag `v1-final` and create `archive/v1`
- [x] Remove the v1 application, pipeline and Cursor-only core
- [x] Rewrite `AGENTS.md` and `README.md`
- [x] Scaffold package, vitest (sandboxed XDG/KANON/QMD dirs), eslint
- [x] Docs skeleton, ADRs 0001–0004, fixtures
- [x] `pnpm docs:index` / `docs:search` / `docs:get`

### K1 — Standard and machine config

- [x] `kanon.yml` (`kanon/source/v1`) and optional `doc`/`vars` frontmatter
- [x] Machine config (`kanon/machine/v1`): sources, indexes, projects, grants
- [x] CLI: `init`, `source`, `index create|list`, `project add`, `grant|revoke`, `doctor`
- [x] Path-escape, duplicate-id, self-grant and local-only journal tests

### K2 — Sync and QMD adapter

- [x] Multi-store spike + ADR
- [x] Pinned QMD adapter, one store per index, explicit `dbPath`
- [x] Fast-forward-only sync; dirty/diverged repos left untouched
- [x] `kanon index update [--embed]` with index generations

### K3 — Scoped retrieval and CLI

- [x] never-rest contract: `search`, `get`, `status`, `listIndexes`
- [x] `kanon://` URIs, revision citations, live-hash check
- [x] CLI via `createLocalClient`
- [x] Negative privacy tests

### K4 — MCP and permissions

- [x] `kanon mcp --project` opens only granted indexes
- [x] `definePolicy` + never-rest `./mcp`
- [x] `kanon mcp-config` prints a generic stdio snippet
- [x] MCP equivalence and leak tests

### K5 — Dogfood and pilot

- [x] Repo `kanon.yml` and docs-index bootstrap
- [x] Fixture retrieval eval baseline
- [x] Offline / rebuild / two-runtime checks documented

## Acceptance Criteria

- [x] CLI runs with no agent installed
- [x] A source repo cannot grant itself roots, remotes or index access
- [x] Unknown and ungranted index names return the same error, with no leaks
- [x] Indexes rebuild from canonical files
- [x] Project docs are searchable via `pnpm docs:search`

## Progress Summary

| Phase | Status |
| --- | --- |
| K0 — Reset and scaffold | Done |
| K1 — Standard and machine config | Done |
| K2 — Sync and QMD adapter | Done |
| K3 — Scoped retrieval and CLI | Done |
| K4 — MCP and permissions | Done |
| K5 — Dogfood and pilot | Done |
