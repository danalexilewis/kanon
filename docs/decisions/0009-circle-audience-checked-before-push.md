# 0009. The circle's audience is checked before every push

- Status: accepted
- Date: 2026-10-12

## Context

Write access is already declared and probed ([ADR 0007](./0007-write-access-is-probed.md)).
That probe asks whether the operator can push. It does not ask who else can
read the remote after the push.

A private GitHub repo whose organisation grants every member read access
will accept the push and still widen the audience. Frontmatter cannot undo
that.

## Decision

Before every push, Kanon runs `checkAudience(circle, source)`. The
implementation is chosen by the remote URL (`hostFor`):

- **local.** The remote is a `file://` URL or an absolute path. The bare
  repo and the circle checkout must be owned by the current user and must
  not be readable by group or other (no `0o077` bits). The audience is then
  `{operator}`. Group- or other-readable is `audience_too_wide`. A failed
  `stat` is `audience_unverified`.
- **Any other remote** (GitHub included) is `audience_unverified` until a
  host probe exists.

Both errors block additions and updates. A commit that only removes files
is still pushed when the audience is too wide, because removing files
reduces what is exposed. An unverified audience pushes nothing.

`people[].github` stays optional. A hosted probe may later require a login
per member.

## Consequences

- Nothing is pushed to an unchecked host.
- Moving a circle to GitHub is a change of `remote` plus a Later host
  probe, not a new ingest pipeline.
- `kanon circle probe` and `kanon doctor` run the same check.
- The operator still needs a write probe ([ADR 0007](./0007-write-access-is-probed.md)).
  Audience and write access are different questions.
