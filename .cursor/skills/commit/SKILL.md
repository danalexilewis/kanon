---
name: commit
description: Group changed files into clean, well-described commits. Looks at the diff and recent agent transcripts to recover intent. Use when the user asks to commit, stage, or wrap up changes.
---

# Commit

Turn a messy working tree into a small set of focused, well-labelled commits.

**Only commit when the user explicitly asks.** Follow the Git Safety Protocol in `AGENTS.md` (never touch git config, never force-push, pass messages via HEREDOC, `add` → `commit` → `status`).

## Workflow

```text
- [ ] 1. Gather the diff and recent intent
- [ ] 2. Group files into logical commits
- [ ] 3. Write short subjects + breadcrumb bodies
- [ ] 4. Create commits sequentially, verify with git status
```

### 1. Gather the diff and recent intent

Run in parallel:

- `git status` — every changed/untracked file.
- `git diff` and `git diff --staged` — what actually changed.
- `git log --oneline -20` — match the repo's existing message style.

Read the **last 2–3 agent transcripts** for this workspace to recover _why_ the changes were made. That "why" is the breadcrumb in commit bodies.

### 2. Group files into logical commits

Group by **intent**, not by folder. One commit = one coherent change. Typical groups:

- Pipeline content: `src/sources/` + related `content/` from the same update-docs run.
- `.cursor/` config changes (rules, skills, hooks) as one group when related.
- App/tooling changes separate from content.
- Never bundle `.env*` or credential files — warn the user instead.

### 3. Write short subjects + breadcrumb bodies

- **Subject**: short, lead with a verb. Examples:
  - `Rebuild .cursor rules for token efficiency`
  - `Ingest meeting notes into sources`
  - `Regenerate content from updated ontology`
- **Body** (optional, 1–2 lines): the _why_ and driving task intent.

### 4. Create commits sequentially

For each group: stage exactly that group's files, then commit with a HEREDOC.

```bash
git add src/sources/documents/example.md content/docs/example.mdx
git commit -m "$(cat <<'EOF'
Regenerate docs from updated source

Reflects ontology change for entity pages.
EOF
)"
```

Run `git status` after the last commit to confirm a clean (or intended) tree.
