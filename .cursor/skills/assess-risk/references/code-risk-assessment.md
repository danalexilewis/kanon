# Code Risk Assessment Framework

**Purpose:** A framework for evaluating the risk profile of proposed code changes before implementation.  
**Cursor Skill:** `.cursor/skills/assess-risk/`

---

## Risk Metrics

### 1. Entropy

**Definition:** A measure of uncertainty, unpredictability, and cognitive load in the system.

| Rating       | Description                                                                 |
| ------------ | --------------------------------------------------------------------------- |
| 🟢 Reduces   | Change simplifies mental models, consolidates interfaces, removes ambiguity |
| 🟡 Neutral   | Change neither adds nor removes significant complexity                      |
| 🔴 Increases | Change adds branching logic, new states, or concepts users must understand  |

**Questions to ask:**

- Does this change reduce or increase the number of concepts users need to understand?
- Does this consolidate or fragment configuration/interfaces?
- Does this make the system more or less predictable?
- Are we adding special cases or removing them?

---

### 2. Surface Area

**Definition:** The amount of code, UI, and API exposed by the change.

| Rating       | Description                                                             |
| ------------ | ----------------------------------------------------------------------- |
| 🟢 Reduces   | Removes code paths, components, or endpoints                            |
| 🟡 Neutral   | Replaces existing surface area with roughly equivalent new surface area |
| 🔴 Increases | Adds new components, endpoints, or code paths without removing old ones |

**Questions to ask:**

- How many new files/components are we adding?
- Are we removing any existing code?
- What's the net line count change?
- Are new components isolated or do they have many integration points?

---

### 3. Backwards Compatibility

**Definition:** The risk of breaking existing functionality or user workflows.

| Rating      | Description                                          |
| ----------- | ---------------------------------------------------- |
| 🟢 Safe     | No impact on existing data or workflows              |
| 🟡 Medium   | UX changes but data/functionality preserved          |
| 🔴 Breaking | Existing workflows may break or data may be affected |

**Questions to ask:**

- Will existing data continue to work without migration?
- Will existing user workflows still function?
- Are we changing any database schemas?
- Do any "sync" or "auto" actions affect existing records, or only new mutations?
- Could users be confused by changes to familiar interfaces?

---

### 4. Reversibility

**Definition:** How easily the change can be undone if problems arise.

| Rating       | Description                                                             |
| ------------ | ----------------------------------------------------------------------- |
| 🟢 Trivial   | Feature flag, config change, or simple conditional removal              |
| 🟡 Moderate  | Requires removing files/code but no data implications                   |
| 🔴 Difficult | Involves data migrations, destructive user actions, or complex rollback |

**Questions to ask:**

- Can this be feature-flagged?
- Does this change involve database migrations?
- Are there any destructive/irreversible user actions?
- If we abandon this, what's the cleanup effort?

---

### 5. Complexity Concentration

**Definition:** Whether the change adds complexity to already-complex areas.

| Rating          | Description                                             |
| --------------- | ------------------------------------------------------- |
| 🟢 Distributed  | New complexity is isolated in new files/components      |
| 🟡 Moderate     | Some complexity added to existing files, but manageable |
| 🔴 Concentrated | Significant complexity added to already-large files     |

**Questions to ask:**

- Are we adding to files that are already large (300+ lines)?
- Should we extract sub-components to distribute complexity?
- Is state management becoming tangled?
- Can new logic be isolated and tested independently?

---

### 6. Testing Surface

**Definition:** The effort required to adequately test the change.

| Rating    | Description                                                  |
| --------- | ------------------------------------------------------------ |
| 🟢 Low    | Few new states, straightforward unit tests                   |
| 🟡 Medium | Multiple UI states, some integration testing needed          |
| 🔴 High   | Complex state interactions, edge cases, requires E2E testing |

**Questions to ask:**

- How many new UI states are we introducing?
- Are there edge cases in state transitions?
- Do we need integration or E2E tests?
- Are there timing/race condition concerns?

---

### 7. Performance Risk

**Definition:** The likelihood of degrading system performance.

| Rating    | Description                                                |
| --------- | ---------------------------------------------------------- |
| 🟢 Low    | No new queries, renders, or data processing                |
| 🟡 Medium | New queries/renders but bounded (e.g., fixed list size)    |
| 🔴 High   | Unbounded loops, N+1 potential, large data transformations |

**Questions to ask:**

- Are we adding database queries inside loops?
- Could this slow down renders for large datasets?
- Are we adding useEffects with broad dependencies?
- Are we passing new data through component trees that could cause re-renders?

---

### 8. Blast Radius

**Definition:** How many users and workflows are affected if something goes wrong.

| Rating    | Description                               |
| --------- | ----------------------------------------- |
| 🟢 Small  | Affects niche feature, few users          |
| 🟡 Medium | Affects common feature, workarounds exist |
| 🔴 Large  | Affects core workflow, all users impacted |

**Questions to ask:**

- Is this a core workflow or a peripheral feature?
- How many users interact with this daily?
- If this breaks, do users have a workaround?
- Could this block critical business operations?

---

## Uncertainty Check

Before finalizing the assessment, consider:

- Are we working in familiar code or uncharted territory?
- Do we fully understand the current behavior we're modifying?
- Are there undocumented edge cases we might hit?
- Has this area caused unexpected bugs before?

**If uncertainty is high**, consider a spike/prototype first to derisk before committing to the full implementation.

---

## Risk Assessment Template

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

### Overall Risk Level

- **Low Risk:** Mostly green, straightforward implementation
- **Medium Risk:** Mix of green/yellow, some areas need attention
- **High Risk:** Multiple red ratings, consider phased rollout or alternatives

### Mitigation Strategies

1. [Strategy for highest-risk areas]
2. [Strategy for medium-risk areas]

### Key Risks to Monitor

- [Risk 1]
- [Risk 2]
```

---

## Common Mitigation Patterns

| Pattern                 | Use When              | Example                                      |
| ----------------------- | --------------------- | -------------------------------------------- |
| **Feature flag**        | Any new UI/behavior   | `if (flags.newFeature) { ... }`              |
| **Phased rollout**      | High blast radius     | Enable for 10% → 50% → 100% of users         |
| **Shadow mode**         | Risky data changes    | Run new logic, compare results, don't commit |
| **Additive-first**      | Schema changes        | Add new column, backfill, then migrate       |
| **Monitoring/alerts**   | Performance risk      | Add metrics before launch, set thresholds    |
| **Manual QA checklist** | Complex UI states     | Document specific states to verify           |
| **Canary deploy**       | High uncertainty      | Deploy to staging/subset before production   |
| **Kill switch**         | External dependencies | Fallback if third-party service fails        |

---

## When to Use This Framework

**Always use for:**

- Changes touching multiple files/components
- Changes affecting user workflows
- Changes involving data or state management
- New features with significant UI

**Optional for:**

- Bug fixes with isolated impact
- Pure refactors with no behavior change
- Documentation updates

---

## Post-Implementation Review

After shipping, revisit the assessment to close the feedback loop:

- Did the actual risk match the predicted risk?
- Were there surprises we didn't anticipate?
- Did the mitigations work as expected?
- What would we assess differently next time?

**Update this framework** if patterns emerge that should be captured for future assessments.
