---
name: brief
description: Write a decision brief before committing to a significant change — new content areas, ontology shifts, pipeline features, or structural refactors. Articulates the problem, scopes the first small step, and names the risks. Use when the user asks to propose, justify, or think through a change before implementing it.
---

# Brief

Write a short decision document before committing to a significant change. Briefs are for alignment and clarity — they force you to articulate why before jumping to how.

## When to use

- Adding a new content area or entity type to the ontology
- Proposing structural changes to the pipeline (ingest, sources, docs)
- Refactoring something that touches multiple stages of the data flow
- Introducing a new tool, dependency, or integration
- Any change where the user says "should we...?" or "I'm thinking about..."

## Core Workflow

1. **Classify the brief type**:
   - **Structural** — Changes to pipeline, ontology, folder layout, or config
   - **Content** — New content areas, entity types, or source categories
   - **Tooling** — New dependencies, integrations, or dev features

2. **Search first** — Check `.cursor/plans/`, `src/sources/`, and `.cursor/rules/ontology.mdc` for related prior work or decisions.

3. **Articulate the 15% solution** — The smallest step that produces real information. No new dependencies, no big refactors. A prototype, a single source file, a manual walkthrough.

4. **Name the costs** — Time, complexity added, maintenance burden, blast radius.

5. **Suggest references** — 2-3 internal files or external links that inform the decision.

## Instructions

- **Problem over solution**: 60% of the brief should be the problem statement.
- **Be honest about costs**: Don't hide complexity or maintenance burden.
- **Keep it short**: A brief is one page, not a spec. If it needs more, it's a plan.
- **Pair with assess-risk**: For implementation-heavy briefs, run the risk assessment after.

## Document Structure

```markdown
## Brief: [Title]

### Problem

What's wrong or missing today? Who feels the pain? What happens if we do nothing?

### Proposed Change

One paragraph. What would we do?

### 15% Solution

The smallest first step that produces information — no new dependencies or permissions needed.
What would we learn from it?

### Costs

| Type             | Estimate                                         |
| ---------------- | ------------------------------------------------ |
| **Time**         | Person-hours or days                             |
| **Complexity**   | What new concepts or moving parts does this add? |
| **Maintenance**  | Ongoing burden after shipping                    |
| **Blast radius** | What breaks if this goes wrong?                  |

### Alternatives Considered

1. [Alternative] — Why not?
2. [Status quo] — What's the cost of doing nothing?

### References

1. [Internal or external link]
2. [Internal or external link]

### Decision

[ ] Proceed with 15% solution
[ ] Proceed with full implementation
[ ] Defer — revisit when [condition]
[ ] Reject — [reason]
```

## Resources

- [Reference Material](references/brief-guidance.md): Cost framing, reference selection, and the 15% solution concept.
