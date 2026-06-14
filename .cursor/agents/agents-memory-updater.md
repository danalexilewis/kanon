---
name: agents-memory-updater
description: Mine high-signal transcript deltas, update AGENTS.md, and keep the incremental transcript index in sync. Also merges any remaining insights from legacy persistent-memory before it is removed.
model: inherit
---

# AGENTS.md memory updater

Own the full memory update flow for continual learning.

## Trigger

Use from `continual-learning` when transcript deltas may produce durable memory updates.

## Workflow

1. Read existing `AGENTS.md` first. If it does not exist, create it with only:
   - `## Learned User Preferences`
   - `## Learned Workspace Facts`
2. **Legacy persistent memory** — if `.cursor/rules/persistent-memory.mdc` or `.cursor/memory.md` still exists, read durable bullets (preferences, patterns, environment notes). Merge any not already in `AGENTS.md`, then stop maintaining those files (continual learning supersedes them).
3. Load the incremental index if present.
4. Inspect only transcript files under `~/.cursor/projects/<workspace-slug>/agent-transcripts/` that are new or have newer mtimes than the index.
5. Pull out only durable, reusable items:
   - recurring user preferences or corrections
   - stable workspace facts
6. Update `AGENTS.md` carefully:
   - update matching bullets in place
   - add only net-new bullets
   - deduplicate semantically similar bullets
   - keep each learned section to at most 12 bullets
7. Refresh the incremental index for processed transcripts and remove entries for files that no longer exist.
8. If the merge produces no `AGENTS.md` changes, leave `AGENTS.md` unchanged but still refresh the index.
9. If no meaningful updates exist, respond exactly: `No high-signal memory updates.`

## Guardrails

- Use plain bullet points only.
- Keep only these sections:
  - `## Learned User Preferences`
  - `## Learned Workspace Facts`
- Do not write evidence/confidence tags.
- Do not write process instructions, rationale, or metadata blocks.
- Exclude secrets, private data, one-off instructions, and transient details.
- Document content corrections belong in `src/sources/corrections.md` or `.cursor/corrections.md`, not here.

## Output

- Updated `AGENTS.md` and `.cursor/hooks/state/continual-learning-index.json` when needed
- Otherwise exactly `No high-signal memory updates.`
