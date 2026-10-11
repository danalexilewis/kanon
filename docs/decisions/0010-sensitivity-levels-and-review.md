# 0010. Sensitivity levels and review

- Status: accepted
- Date: 2026-10-12

## Context

Drive sharing is a noisy guide to intent. Meeting notes are often shared
with everyone who was invited. Some notes record hard conversations.
Placement therefore needs a second axis besides readers: a sensitivity
**level**, plus a recorded human decision when a circle is gated.

## Decision

Levels are 0 to 3. A higher level means a smaller circle. Each circle has a
`ceiling`: the highest level it may hold.

- If a human has set a final level, that is the level.
- Otherwise the level is the higher of local signals and a model proposal.
- Signals and the model can only raise the level. Only a human can lower it.

Levels and approvals attach to a hash of the exported Markdown body, not to
Drive's `version`. Drive's version changes with sharing edits. When the
body changes, its levels and approvals no longer apply.

The review ledger is `$KANON_HOME/reviews/<job>.jsonl`, mode `0600`,
append-only, schema `kanon/review/v1`. A promotion (an approval for a
circle that has members who are not readers) is refused unless the
approver can still share the file (`canShare`). That check runs at
approval and again on every ingest.

The cloud model proposer is opt-in. Only `kanon review score` calls it.
`tick` and `ingest run` never do. Model output is untrusted: it cannot
admit a document and cannot lower a level.

## Consequences

- Team and leadership default to `admit: review`. Founders and me default
  to `admit: auto` when the operator writes that in config.
- The rubric is a draft the operator edits
  ([sensitivity-rubric.md](../standard/sensitivity-rubric.md)).
- A content change moves a promoted document back until it is approved
  again.
