---
Date: 2026-10-11
Status: Done
Last updated: 2026-10-12
Applies to: Kanon v2 — circles of trust for ingest
---

# Circles of trust

Each ingested document goes to one circle. A circle is a named set of
people backed by a local bare repo and checkout. Placement uses Drive
sharing, a 0–3 sensitivity level and recorded approvals. Before every
push, Kanon checks the remote's audience. Local `file://` remotes use an
owner-only filesystem check. Hosted remotes stay unverified until a host
probe exists.

This document describes the current plan. It is not a spec. Update it as
the implementation changes.

## Decisions

- Circles live only in machine config. `kanon.yml` cannot declare them
  ([ADR 0008](../docs/decisions/0008-circles-of-trust.md)).
- `ingest[].route` replaces `ingest[].source`. There is no unrouted ingest.
- Placement is a pure function: audience, ceiling, admission, not excluded.
- Levels and approvals attach to a content hash
  ([ADR 0010](../docs/decisions/0010-sensitivity-levels-and-review.md)).
- The audience is checked before every push, behind `HostAudience`
  ([ADR 0009](../docs/decisions/0009-circle-audience-checked-before-push.md)).
- GitHub logins stay optional until a hosted probe exists.
- The model proposer is opt-in and never runs from `tick` or `ingest run`.
- Public-repo hygiene: example.test identities only.

## Deliverables

### C1 — Docs first

- [x] ADRs 0008, 0009, 0010 (proposed)
- [x] Sensitivity rubric draft
- [x] KM background review
- [x] This plan
- [x] Threat-model assets, untrusted inputs and invariants

### C2 — Domain core

- [x] `resolveReaders`, `eligibleCircles`, `placeDocument`
- [x] `scoreSignals`, `proposedLevel`
- [x] `reduceLedger`
- [x] Table-driven and randomized invariant tests

### C3 — Config

- [x] `people`, `domains`, `circles`, `scorers`, `ingest[].route`, `ingest[].score`
- [x] Reject `ingest[].source`
- [x] Validation tests, including `kanon.yml` cannot declare circles

### C4 — Drive sharing

- [x] `sharing`, `canShare`, `account` on the connector
- [x] Scan `kanon/ingest-scan/v2`
- [x] fakeDrive tests

### C5 — Local audience

- [x] `hostFor` / `checkAudience`
- [x] `kanon circle init|list|probe`
- [x] Doctor check
- [x] Owner-only and hosted-unverified tests

### C6 — Routed ingest

- [x] `prepareIngest` and `pushCircle`
- [x] Moves, narrowing, `doc.access`, reports
- [x] Routing and incident tests

### C7 — Review ledger and CLI

- [x] Ledger IO and review commands
- [x] Device check and `promotion_denied`
- [x] CLI tests; commands stay off the MCP tool list

### C8 — Cloud model proposer

- [x] OpenAI-compatible adapter
- [x] `scorer add|list`, `review score --dry-run`
- [x] Model tests (no emails, no lower, no tick/ingest call)

### C9 — Guides and sync

- [x] Circles guide and runbooks
- [x] Standards, architecture, AGENTS, README
- [x] `pnpm docs:index`, mark ADRs accepted, rsync to kanon-dan

### C10 — Operator-local rollout

- [ ] Out of scope for the implementation pass. Needs the operator.

## Acceptance Criteria

- [x] No code path writes an ingested document to a source that is not a
      circle in the job's route
- [x] The randomized test shows the placement rule always holds
- [x] No addition or update is pushed without a passing `checkAudience`
- [x] Hosted remotes are always unverified for now
- [x] The model only raises levels, never admits, never runs from tick or
      ingest run
- [x] Promotions need `canShare` at approval and on every run
- [x] Content changes cancel levels and approvals
- [x] Sharing changes update `doc.access` and move documents
- [x] Ledger, staging, credentials and circle repos are owner-only
- [x] The public tree contains no real identities; tests make no network calls

## Later

- GitHub host probe (collaborators, invitations, visibility, owner)
- `kanon host auth github`
- Enforcing GitHub logins for hosted circles
- Org base-permission runbook
- GitHub Support purge request
- Group expansion through Cloud Identity
- Drive Labels as a signal
- Distilled summaries for wider circles
- Write-down guard (a project granted a narrow index sitting inside a
  wider checkout)
- Approvals across small edits
- GitLab or Gitea probes

## Progress Summary

| Phase | Status |
| --- | --- |
| C1 — Docs first | Done |
| C2 — Domain core | Done |
| C3 — Config | Done |
| C4 — Drive sharing | Done |
| C5 — Local audience | Done |
| C6 — Routed ingest | Done |
| C7 — Review ledger and CLI | Done |
| C8 — Cloud model proposer | Done |
| C9 — Guides and sync | Done |
| C10 — Operator-local rollout | Later |
