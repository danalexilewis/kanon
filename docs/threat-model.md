---
schema: eddy-kb/document/v1
doc:
  id: 1b8e5d32-99e2-4c81-8f3b-7a2d1e4f5b6c
  title: Threat model
  kind: derivative
  status: draft
---

# Threat model

This page is the current model, not a certification.

## Assets

- Team-shared Markdown in managed clones.
- Local-only journals.
- QMD indexes (projections of the above).
- Machine config (roots, remotes, grants).
- Git credentials used by sync.

## Trusted

- The human operator who edits `$KANON_HOME`.
- Application code in this repository.
- A pinned QMD SDK talking to an explicit `dbPath`.

## Untrusted

- Source repository contents, including `kanon.yml`.
- Agent runtimes and their prompts.
- QMD collection names or paths supplied by a caller.
- Frontmatter labels such as `status: approved`.
- The global `~/.config/qmd` file.

## Local project identity

`kanon mcp --project <id>` is a **declared** identity checked against
operator grants. It stops accidental cross-project exposure. It does **not**
isolate a hostile agent that already has the operator's OS account, the
config file, and the index files. That needs a real execution boundary
(separate OS user, sandbox, or later HTTP credentials).

## Invariants

- Unknown and ungranted index names return the same `index_not_available`
  error. No titles, snippets, counts, or paths leak.
- A caller cannot widen the corpus by passing another collection, path,
  profile, or document id.
- Sync never auto-resets, auto-stashes, or force-pushes.
- Tests must not read or write the operator's real QMD config.
