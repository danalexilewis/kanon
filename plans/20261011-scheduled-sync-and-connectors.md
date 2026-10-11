---
Date: 2026-10-11
Status: Done
Last updated: 2026-10-11
Applies to: Kanon v2 — scheduled refresh, ingest and connectors
---

# Scheduled sync and connectors

Kanon runs scheduled jobs. **Refresh** keeps every source and index current.
**Ingest** pulls documents from external stores (Google Drive first) into
sources the operator can push to, then commits and pushes them.

This document describes the current plan. It is not a spec. Update it as the
implementation changes.

## Decisions

- Machine config stays the only authority. `kanon.yml` cannot declare
  connectors, schedules or write access.
- Write access is declared, then probed with a dry-run push, before saving
  and before every ingest ([ADR 0007](../docs/decisions/0007-write-access-is-probed.md)).
- Connector output lands as Markdown in Git; the repository is the ingest
  state ([ADR 0006](../docs/decisions/0006-connectors-land-as-markdown-in-git.md)).
- Ingest works in a temporary worktree at the remote tip and pushes
  fast-forward only, directly to the configured branch. No reset, stash or
  force-push.
- Local sources are rescanned and compared by content hash, never fetched.
- The OS fires `kanon tick` hourly (launchd or systemd); cadence lives in
  config.
- Multiple devices: device identity in `$KANON_HOME/device.yml` and
  `ingest[].device` assignment. Config sync is left to tools like chezmoi.
- Jobs are operator-only: CLI and SDK, not the never-rest contract or MCP.

## Deliverables

### S1 — Config and access

- [x] `sources[].access` and `refresh`, `indexes[].embed`, `connectors[]`, `ingest[]`
- [x] Cross-field `superRefine`: write needs managed + remote; ingest needs a write source and a known connector; unique, contained targets
- [x] Device identity (`kanon device show|rename`), created once by `kanon init`
- [x] Git env allowlist, hooks off, network timeouts; `gitLsRemote`, `gitProbeWrite`, worktree helpers
- [x] `kanon source set|probe`, `source add --access --refresh`, doctor checks

### S2 — Refresh

- [x] Managed: `ls-remote` the configured remote, fetch + `merge --ff-only`
- [x] Indexes are stale when built from another commit (catches manual pulls)
- [x] Local: rescan and compare `(relativePath, contentHash)` with catalogues; no git network calls
- [x] Each affected index rebuilt once; `kanon refresh [<id>] [--force]`

### S3 — Runner and scheduler

- [x] Cadence maths with 5-minute drift tolerance
- [x] Job state, tick lock with stale-pid detection, run reports (last 50)
- [x] `kanon tick`: due refresh, then ingest for this device; skips `assigned_elsewhere` and `no_credentials`
- [x] `kanon jobs status`
- [x] `kanon schedule install [--dry-run]|uninstall|status` (launchd, systemd)

### S4 — Ingest pipeline

- [x] Connector types and `createConnector` registry
- [x] Probe, worktree at remote tip, mirror into target, frontmatter, assets
- [x] Validate with the source scanner, commit with Kanon trailers, push without force
- [x] One rebuild on non-fast-forward, reusing cached reads
- [x] `--dry-run`, ownership by URI scheme, symlink and containment checks
- [x] `kanon ingest list`, `kanon ingest run <id> [--dry-run] [--here]`

### S5 — Google Drive

- [x] OAuth Desktop loopback with PKCE and state; service-account JWT
- [x] Recursive listing with paging, shared drives, cycle guard
- [x] Docs exported as `text/markdown`; `.md` files downloaded
- [x] Retries on 429/5xx; 401 maps to `connector_auth_required`
- [x] `kanon connector add|auth|list`; credentials in `$KANON_HOME/credentials/` (0600)
- [x] SDK exports; MCP tool list unchanged

### S6 — Docs

- [x] Machine config, threat model, architecture, document format
- [x] Guides: scheduled jobs, Google Drive, multiple devices
- [x] ADRs 0006 and 0007
- [x] AGENTS.md table, docs index, `pnpm docs:index`

## Acceptance Criteria

- [x] Ingest pushes only to probed write sources, to the configured remote and branch, never forced, only inside the job's target
- [x] The operator checkout moves only by fast-forward
- [x] Unchanged upstream revisions produce no commit and no re-read
- [x] Two devices running one job produce exactly one commit
- [x] Local sources are never fetched
- [x] Jobs do not appear in the MCP tool list
- [x] Tests use bare `file://` remotes, mocked `fetch` and fake schedulers; no network

## Later

- Converters for docx, PDF and other non-Markdown formats.
- Dropbox and OneDrive connectors.
- Raising refresh to hourly by default once daily has proved itself.

## Progress Summary

| Phase | Status |
| --- | --- |
| S1 — Config and access | Done |
| S2 — Refresh | Done |
| S3 — Runner and scheduler | Done |
| S4 — Ingest pipeline | Done |
| S5 — Google Drive | Done |
| S6 — Docs | Done |
