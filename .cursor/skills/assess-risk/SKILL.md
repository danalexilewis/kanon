---
name: assess-risk
description: Assess the risk profile of code changes or proposed features using the project's risk framework. Use when evaluating a feature proposal, reviewing implementation plans, or when the user asks about risk, impact, or safety of changes.
---

# Risk Assessment

Evaluate code changes using the project's risk framework. For the complete framework with detailed questions, see [references/code-risk-assessment.md](references/code-risk-assessment.md).

## Risk Metrics

| Metric                       | 🟢 Low                   | 🟡 Medium                         | 🔴 High                                |
| ---------------------------- | ------------------------ | --------------------------------- | -------------------------------------- |
| **Entropy**                  | Simplifies mental models | Neutral complexity                | Adds branching/states/concepts         |
| **Surface Area**             | Removes code paths       | Replaces equivalent               | Adds without removing                  |
| **Backwards Compat**         | No impact                | UX changes, data preserved        | May break workflows/data               |
| **Reversibility**            | Feature flag/trivial     | Remove code, no data impact       | Migrations/destructive actions         |
| **Complexity Concentration** | Isolated in new files    | Some additions to existing        | Adds to already-large files            |
| **Testing Surface**          | Few states, unit tests   | Multiple UI states                | Complex interactions, E2E needed       |
| **Performance Risk**         | No new queries/renders   | Bounded new operations            | N+1, unbounded loops, large transforms |
| **Blast Radius**             | Niche feature, few users | Common feature, workarounds exist | Core workflow, all users impacted      |

## Assessment Process

1. **Identify scope** - What files, components, and data are affected?
2. **Rate each metric** - Use the table above, justify each rating
3. **Determine overall risk** - Low (mostly 🟢), Medium (mixed), High (multiple 🔴)
4. **Propose mitigations** - Feature flags, phased rollout, testing strategy

## Output Template

```markdown
## Risk Assessment: [Feature Name]

### Summary

| Metric                   | Rating   | Notes |
| ------------------------ | -------- | ----- |
| Entropy                  | 🟢/🟡/🔴 |       |
| Surface Area             | 🟢/🟡/🔴 |       |
| Backwards Compatibility  | 🟢/🟡/🔴 |       |
| Reversibility            | 🟢/🟡/🔴 |       |
| Complexity Concentration | 🟢/🟡/🔴 |       |
| Testing Surface          | 🟢/🟡/🔴 |       |
| Performance Risk         | 🟢/🟡/🔴 |       |
| Blast Radius             | 🟢/🟡/🔴 |       |

### Overall Risk: [Low/Medium/High]

[1-2 sentence summary of key risk factors]

### Mitigation Strategies

1. [For highest-risk areas]
2. [For medium-risk areas]

### Key Risks to Monitor

- [Risk 1]
- [Risk 2]
```

## When to Assess

**Always assess:**

- Changes touching multiple files/components
- Changes affecting user workflows
- Changes involving data or state management
- New features with significant UI

**Optional:**

- Bug fixes with isolated impact
- Pure refactors with no behavior change
- Documentation updates
