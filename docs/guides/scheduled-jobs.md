---
schema: eddy-kb/document/v1
doc:
  id: 9c49b222-3193-40ec-902b-eb33ac17a48c
  title: Scheduled jobs
  kind: derivative
  status: draft
---

# Scheduled jobs

Kanon runs two kinds of job:

- **Refresh** keeps sources and indexes current. Managed sources are
  fast-forwarded when their remote moved; local sources are rescanned. Every
  source with `refresh` other than `off` takes part (daily by default).
- **Ingest** pulls documents from a connector, places each one in a circle
  on the job's route, and pushes to that circle after an audience check.
  See [Google Drive](./google-drive.md) and
  [Circles of trust](./circles-of-trust.md).

## Install the scheduler

```bash
pnpm kanon schedule install --dry-run   # print the plist or units
pnpm kanon schedule install
pnpm kanon schedule status
```

On macOS this writes `~/Library/LaunchAgents/works.eddy.kanon.tick.plist`
and loads it with `launchctl`. On Linux it writes `kanon-tick.service` and
`kanon-tick.timer` under `~/.config/systemd/user/` and enables the timer.
Both fire `kanon tick` hourly; a machine that slept catches up on the next
tick.

The entry records the exact `node` binary, loader flags and script of the
command that installed it, plus `KANON_HOME` and `KANON_CACHE` if set.
Under `pnpm kanon` that includes tsx's versioned path in `node_modules`, so
re-run `schedule install` after moving the checkout, upgrading dependencies
or changing Node versions. `schedule uninstall` removes it.

Cadence lives in `config.yml`, so changing `refresh: daily` to `hourly`
needs no reinstall.

## Give a source write access

```bash
pnpm kanon source set <source-id> --access write --refresh daily
pnpm kanon source probe <source-id>
```

`--access write` is saved only if a dry-run push to the configured remote
succeeds. `kanon doctor` re-probes and reports lost access.

## Run jobs by hand

```bash
pnpm kanon refresh [<source-id>] [--force]
pnpm kanon ingest list
pnpm kanon ingest scan <job-id>
pnpm kanon ingest run <job-id> --from-scan [--limit <n>]
pnpm kanon ingest run <job-id> --dry-run
pnpm kanon ingest run <job-id>
pnpm kanon tick [--force]
pnpm kanon jobs status
```

Manual runs share the tick lock and record their result, so the next tick
does not repeat them straight away. `--force` ignores cadence. `ingest scan`
only reads, so it takes no lock and records nothing in job state.

## Reading results

`kanon tick` prints a report and keeps the last 50 under
`$KANON_CACHE/jobs/runs/`. Scheduled output goes to
`$KANON_CACHE/jobs/logs/tick.log`. A tick exits non-zero when any job or
index rebuild failed. If another tick holds the lock it reports `locked`
and exits cleanly.

| Status | Meaning |
| --- | --- |
| `dirty`, `diverged`, `wrong_branch` | Checkout left untouched; fix it by hand |
| `write_denied` | The push probe failed; nothing was listed or committed |
| `push_rejected` | The remote refused the push (often branch protection) |
| `assigned_elsewhere` | The ingest job belongs to another device |
| `no_credentials` | Unassigned job skipped; this device has no credentials |

Kanon commits with `--no-gpg-sign` so a background job never waits on a
signing prompt. A branch that requires signed commits reports
`push_rejected`.
