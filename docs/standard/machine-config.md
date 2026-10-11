---
schema: eddy-kb/document/v1
doc:
  id: 4e9b8065-cc25-4f14-b2e6-0d5a4b7c8e9f
  title: Machine configuration
  kind: derivative
  status: draft
---

# Machine configuration

Operator-local file: `$KANON_HOME/config.yml` (or
`$XDG_CONFIG_HOME/kanon/config.yml`). Schema `kanon/machine/v1`.

```yaml
schema: kanon/machine/v1
sources:
  - id: 93ebd59e-d353-4c6b-9b35-6724937abf40
    kind: managed
    path: /Users/you/kb/team-docs
    remote: git@github.com:org/team-docs.git
    branch: main
    access: write        # read (default) | write
    refresh: daily       # off | hourly | daily (default) | weekly
  - id: 4f1c2a90-6b7e-4c1d-9a8f-2e3d4c5b6a70
    kind: local
    path: /Users/you/journal
    refresh: hourly
indexes:
  - id: team
    sources:
      - 93ebd59e-d353-4c6b-9b35-6724937abf40
    embed: false         # scheduled rebuilds also embed when true
projects:
  - id: my-app
    root: /Users/you/repos/my-app
grants:
  - project: my-app
    indexes:
      - team
people:
  - { id: operator, google: [operator@example.test] }
domains: [example.test]
circles:
  - { id: me, source: 93ebd59e-d353-4c6b-9b35-6724937abf40, members: [operator], ceiling: 3, admit: auto }
connectors:
  - id: team-drive
    kind: google-drive
    auth: oauth          # oauth | service-account
ingest:
  - id: policies
    connector: team-drive
    route: [me]                 # widest first; ingest[].source is rejected
    folder: 1AbCdEfGhIjKlMnOp   # Drive folder id, read recursively
    target: docs/policies       # inside a kanon.yml root
    schedule: weekly            # off | hourly | daily (default) | weekly
    images: extract             # extract (default) | strip
    author: { name: Kanon, email: kanon@example.com }  # optional
    device: studio              # optional; only this device runs the job
```

## Sources

- `kind: managed` is a clone Kanon may fast-forward. `kind: local` is
  never fetched. Journals default to local.
- `refresh` sets how often `kanon tick` checks a source. A managed source
  compares the remote head with `HEAD` and fast-forwards when it moved. A
  local source is rescanned; if any path or content hash differs from the
  index catalogue, its indexes are rebuilt.
- `access: write` lets ingest jobs push to the source. It needs
  `kind: managed` and a `remote`, and is saved only after a dry-run push
  succeeds (see [ADR 0007](../decisions/0007-write-access-is-probed.md)).
- Changing trusted roots and remotes requires the operator (this file).

## Connectors and ingest

- A connector holds no secrets here. Credentials live in
  `$KANON_HOME/credentials/<id>.json` with mode `0600`, written by
  `kanon connector add` and `kanon connector auth`.
- An ingest job must point at a known connector and at a `route` of
  circles. Each circle source is a managed write source with a remote.
  `kanon.yml` cannot declare people, circles or routes.
- `target` is relative, has no `..`, and must sit inside a root declared by
  the source's `kanon.yml`. Targets are unique per source; the job owns the
  files it writes there.
- `device` matches the `name` in `$KANON_HOME/device.yml`. Without it, any
  device holding the connector's credentials runs the job.

A config that breaks any of these rules fails to load.

## Device identity

`$KANON_HOME/device.yml` is created once by `kanon init`:

```yaml
schema: kanon/device/v1
id: 2b5c8e1a-4f3d-4a6b-9c7e-1d2f3a4b5c6d
name: studio
```

The name starts as the cleaned-up hostname and is then stored, so it
survives hostname changes. `kanon device rename <name>` changes it. Never
sync this file between machines.

## Derived state

QMD files, catalogues and job state live under the cache directory
(`$KANON_CACHE`), not in Git: `jobs/state.json`, `jobs/tick.lock`,
`jobs/runs/` (last 50 tick reports), `jobs/logs/tick.log`,
`jobs/scans/<job-id>.json` (the latest `kanon ingest scan`),
`jobs/staging/` (mode `0700`) and temporary `jobs/worktrees/`. The review
ledger is `$KANON_HOME/reviews/<job>.jsonl` (mode `0600`).
