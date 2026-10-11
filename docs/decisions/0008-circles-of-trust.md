# 0008. Circles of trust

- Status: accepted
- Date: 2026-10-12

## Context

A Drive ingest job writes every document in a folder to one Git source.
Drive sharing is per file. Once a file is in a repository, frontmatter
cannot hide it from anyone who can read that repository. One folder, one
repo is the wrong grain.

Kanon already uses *principal* (who is calling) and *grant* (a project's
access to an index). Those words stay there.

## Decision

Each ingested document lands in exactly one **circle**. A circle is a named
set of people backed by exactly one managed write source — one local bare
repo, one checkout, one index.

Eddy's four circles, widest first: team, leadership, founders, me. Default
ceilings: team 0, leadership 1, founders 2, me 3.

Placement is a pure function. Walk the job's `route` from the widest circle
and take the first that passes all four tests:

1. **Audience.** Every member is a reader of the origin file, or a recorded
   promotion exists and the approver can still share the file.
2. **Sensitivity.** The document's level is at or below the circle's ceiling.
3. **Admission.** The circle is `admit: auto`, or an approval exists for
   this content hash.
4. **Not excluded.** The document has not been excluded.

A document that fits no circle is **held**. It is written nowhere.

`kanon.yml` cannot declare people, circles, scorers or ingest routes.
There is no unrouted ingest: `ingest[].source` is rejected.

## Consequences

- Indexes stay the unit of access ([ADR 0003](./0003-index-is-unit-of-access.md)).
  A narrower circle is a different index, granted separately.
- Git history still holds a file after it is removed. Narrowing is reported
  with a warning; a purge is a runbook, not an automatic rewrite.
- Hosted remotes come later. Until then each circle is a local `file://`
  remote, and the audience check is the local owner-only rule
  ([ADR 0009](./0009-circle-audience-checked-before-push.md)).
