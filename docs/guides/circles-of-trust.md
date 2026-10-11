---
schema: eddy-kb/document/v1
doc:
  id: 2c9e1a74-6b50-4d8f-8e3a-0f1d2c3b4a59
  title: Circles of trust
  kind: derivative
  status: draft
---

# Circles of trust

Each ingested document lands in one circle: a named set of people backed
by a local bare repo and checkout. Placement uses Drive sharing, a
sensitivity level and recorded approvals. Before every push, Kanon checks
that the remote is owner-only. See [ADR 0008](../decisions/0008-circles-of-trust.md).

## Setup

Declare people and domains in machine config, then create each circle
outside any cloud-synced folder:

```bash
pnpm kanon circle init me --dir ~/circles --members operator --ceiling 3
pnpm kanon circle init founders --dir ~/circles --members operator,cofounder --ceiling 2
pnpm kanon circle probe
```

`circle init` writes a `0700` bare repo, a checkout with `kanon.yml`, a
managed write source and an index. Then set `admit` and the job route:

```yaml
ingest:
  - id: meetings
    connector: team-drive
    route: [team, founders, me]   # widest first
    folder: <folder-id>
    target: docs/meetings
    schedule: off
```

`ingest[].source` is rejected. Scan, then run:

```bash
pnpm kanon ingest scan meetings
pnpm kanon ingest run meetings --from-scan --limit 10 --dry-run
```

## Review

Team and leadership default to `admit: review`. Queue, set a level,
approve with a note:

```bash
pnpm kanon review list meetings --pending
pnpm kanon review queue meetings --circle team <file-id>
pnpm kanon review approve meetings <file-id> --circle team --note "…"
```

A promotion (members who are not readers) needs `canShare` at approval
and on every run. A content change cancels the approval.

## Model proposer

Optional. Only `kanon review score` calls it. Prefer a provider with
zero data retention. The model can raise a level; it cannot lower one
or admit a document. `tick` and `ingest run` never call it.

```bash
pnpm kanon scorer add cloud --kind openai-compatible --endpoint https://api.example.test/v1 --model example-model --api-key-stdin
pnpm kanon review score meetings --dry-run
```

## Runbooks

### Add or remove a member (local)

1. Edit `people` and `circles[].members`.
2. `kanon circle check <id> --job meetings --add|--remove <person>`
3. Run ingest. The local repo's audience is still `{operator}`. Hosted
   collaborator grants come later.

### Narrowing and local history

When a document leaves a circle, Kanon removes the file and warns that
Git history still holds it. To purge a local circle:

```bash
git filter-repo --path docs/meetings/the-note.md --invert-paths
```

Run that on the bare repo and the checkout, then `git gc`.

### Before hosting a circle

Deferred. A hosted remote is `audience_unverified` until a host probe
exists. Do not point `remote` at GitHub yet.
