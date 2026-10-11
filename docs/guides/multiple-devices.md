---
schema: eddy-kb/document/v1
doc:
  id: 17aa06c4-43ae-43e2-a179-02a0d8621007
  title: Multiple devices
  kind: derivative
  status: draft
---

# Multiple devices

Every device is an equal. Git carries content, each device builds its own
indexes and runs its own scheduler, and nothing derived is synced.

## What runs where

| Job | Where |
| --- | --- |
| Refresh | Every device, for itself |
| Ingest with `device: <name>` | Only the device with that name |
| Ingest without `device` | Any device that holds the connector's credentials |

If two devices do run the same job, the second push is rejected as
non-fast-forward. Kanon rebuilds from the new tip, finds the same revisions
in frontmatter and commits nothing.

## Name each device

`kanon init` creates `$KANON_HOME/device.yml` once:

```bash
pnpm kanon device show
pnpm kanon device rename studio
```

Assign an ingest job to it:

```yaml
ingest:
  - id: policies
    device: studio
```

On other devices `kanon jobs status` shows the job with `runsHere: false`,
and `kanon ingest run policies` refuses unless you pass `--here`.

## Credentials stay per device

Run `kanon connector add` and `kanon connector auth` on the device that runs
the job. Write access is probed with that device's own Git credentials.
Never copy `device.yml` or `credentials/` between machines.

## Share config with chezmoi

Kanon adds nothing for config sync. With [chezmoi](https://www.chezmoi.io/),
keep one template for `~/.config/kanon/config.yml` and switch paths on the
hostname:

```yaml
# ~/.local/share/chezmoi/dot_config/kanon/config.yml.tmpl
schema: kanon/machine/v1
sources:
  - id: 93ebd59e-d353-4c6b-9b35-6724937abf40
    kind: managed
{{- if eq .chezmoi.hostname "studio" }}
    path: /Users/you/kb/team-docs
{{- else }}
    path: /home/you/kb/team-docs
{{- end }}
    remote: git@github.com:org/team-docs.git
    access: write
indexes:
  - id: team
    sources: [93ebd59e-d353-4c6b-9b35-6724937abf40]
projects: []
grants: []
```

And keep device-local files out:

```text
# ~/.local/share/chezmoi/.chezmoiignore
.config/kanon/device.yml
.config/kanon/credentials/**
```

Each device then runs `kanon init`, signs in to any connectors it runs, and
installs its own scheduler with `kanon schedule install`.
