# 0001. Rewrite in place

- Status: accepted
- Date: 2026-10-11

## Context

Kanon v1 was a Cursor-driven ELT pipeline publishing Fumadocs. The review
asked for a new application. The operator chose to keep the `kanon` repo.

## Decision

Tag `v1-final`, keep `archive/v1`, and replace the tree. Do not fork. Do
not carry Next, Fumadocs, ingest hooks, or editor-required core.

## Consequences

History stays in git. v1 code is obsolete. New agents should start from
`AGENTS.md` and `docs/`.
