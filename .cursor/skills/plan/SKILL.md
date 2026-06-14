---
name: planning
description: Create and update plan documents in .cursor/plans/. Use when the user asks to write a new plan, update progress, mark tasks done, or assess how far a plan has gotten.
---

# Planning

Create and update plan documents. Plans live in `.cursor/plans/*.md`.

## When to use

- User asks to **create a plan** for upcoming work
- User asks "how far have we got" or "update the plan"
- User wants to mark tasks complete, update status, or add a progress summary
- After completing work that a plan describes

## Quick Start

**Update an existing plan:**

1. Read the plan in `.cursor/plans/`
2. Check the repo against plan tasks
3. Update checkboxes, status, and progress summary

**Create a new plan:** Use the skeleton template below.

## Workflow: Updating a Plan

1. **Read the plan** — Understand phases, tasks, and acceptance criteria.
2. **Gather context** — Read `src/sources/`, `content/`, `.cursor/rules/ontology.mdc`, and existing `.cursor/plans/` for related work.
3. **Verify against the repo** — Only mark complete what you can confirm exists.
4. **Update the plan**:
   - Set `Status` and `Last updated` in frontmatter
   - Mark completed tasks with `[x]`
   - Update acceptance criteria checkboxes
   - Add or refresh the **Progress summary** table at the end

## Workflow: Creating a New Plan

1. **Gather context** — Read `README.md`, `SETUP.md`, `src/`, `content/`, and `.cursor/rules/ontology.mdc`.
2. **Create the plan** — Write to `.cursor/plans/<slug>.plan.md` using the skeleton below.
3. **Break work into phases** — Each phase gets a checklist of concrete deliverables.
4. **Add acceptance criteria** — Testable conditions that define "done".
5. **Add a progress summary table** — Even for new plans (all phases start as "Not started").

## Context Sources

| Source                       | What it tells you         |
| ---------------------------- | ------------------------- |
| `src/sources/`               | Canonical content corpus  |
| `content/`                   | Derived Fumadocs output   |
| `.cursor/rules/ontology.mdc` | Knowledge base schema     |
| `.cursor/plans/`             | Prior plans and decisions |

## Plan Document Skeleton

```markdown
---
Date: YYYY-MM-DD
Status: Proposed
Last updated: YYYY-MM-DD
Applies to: <scope description>
---

# Plan Title

One-paragraph description of what this plan delivers and why.

## Context

Background: what problem this solves, who it's for, key constraints.

## Deliverables

### Phase 1 — <name>

- [ ] Deliverable one
- [ ] Deliverable two

## Acceptance Criteria

- [ ] Criterion one
- [ ] Criterion two

## Progress Summary

| Phase            | Status      |
| ---------------- | ----------- |
| Phase 1 — <name> | Not started |
```

## Plan Document Conventions

### Status values

| Status      | Meaning                                      |
| ----------- | -------------------------------------------- |
| Proposed    | Plan written, work not started               |
| In progress | Some tasks complete, work ongoing            |
| Mostly done | Most tasks complete, minor items remain      |
| Done        | All deliverables and acceptance criteria met |

## Related

- **Continual learning** (`AGENTS.md` learned sections): Durable preferences maintained by the continual-learning plugin.
