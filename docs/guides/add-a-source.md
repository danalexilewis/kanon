---
schema: eddy-kb/document/v1
doc:
  id: 5fac9176-dd36-4025-c3f7-1e6b5c8d9f0a
  title: Add a source
  kind: derivative
  status: draft
---

# Add a source

```bash
pnpm kanon init
pnpm kanon source init ./notes
# edit notes/kanon.yml and add Markdown under the declared roots
pnpm kanon source add --path ./notes --kind local
pnpm kanon index create notes --source <uuid-from-kanon.yml>
pnpm kanon index update notes
```

For a Git remote you trust:

```bash
pnpm kanon source add --path ./checkout --kind managed --remote git@example.com:org/docs.git --branch main
pnpm kanon sync
```

Dirty or diverged managed checkouts are left untouched and reported.

To keep a source current on a schedule, or let ingest jobs push to it:

```bash
pnpm kanon source add --path ./checkout --kind managed --remote git@example.com:org/docs.git --access write --refresh daily
```

`--access write` is saved only after a dry-run push succeeds. See
[Scheduled jobs](./scheduled-jobs.md).
