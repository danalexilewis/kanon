# 0007. Write access is declared, then probed

- Status: accepted
- Date: 2026-10-11

## Context

Ingest jobs push to source repositories on a schedule. A typo in config, a
revoked token or a read-only clone should not turn into a failed push at
3 a.m., or worse, a push to the wrong place. Git hosts expose permissions
differently, and Kanon should not need host-specific APIs.

## Decision

- `sources[].access: write` lives only in machine config. `kanon.yml` cannot
  request it.
- It is allowed only on `kind: managed` sources with an explicit `remote`.
- Before saving it, and again before every ingest, Kanon runs
  `git push --dry-run --porcelain <remote> HEAD:refs/heads/<branch>` with the
  operator's own Git credentials. A failure is `write_denied`, and nothing
  is listed, committed or pushed.
- Pushes go only to the configured remote and branch, never with force.

## Consequences

- Works with any Git host and credential helper, with no API tokens.
- The probe cannot see branch protection or signed-commit rules. A rejected
  real push is reported as `push_rejected`, and the commit is discarded with
  the worktree.
- `kanon doctor` re-probes, so lost access shows up before the next run.
