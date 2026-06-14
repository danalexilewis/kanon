# Brief Reference Material

## The 15% Solution

Inspired by [Liberating Structures](https://www.liberatingstructures.com/7-15-solutions/):

- **Constraint**: No extra budget, permissions, or dependencies.
- **Goal**: Information gain — learn whether the full change is worth it.
- **Output**: A prototype, a single source file, a manual process walkthrough, or a small experiment.

Good 15% solutions for Kanon:

| Change type         | 15% solution                                                              |
| ------------------- | ------------------------------------------------------------------------- |
| New entity type     | Write one source file by hand using the proposed schema                   |
| Pipeline change     | Run the new logic manually on 2-3 files, check the output                 |
| New integration     | Hardcode a single example, verify it renders correctly                    |
| Ontology shift      | Update the schema, run `create-ontology` on existing sources, review gaps |
| Structural refactor | Move one file, fix all references, verify build passes                    |

## Cost Estimation

### Time

- **Trivial** (< 1 hour): Config changes, single-file edits, rule updates
- **Small** (1-4 hours): New skill, new template, small pipeline addition
- **Medium** (half day - 2 days): New entity type end-to-end, multi-file refactor
- **Large** (> 2 days): New pipeline stage, major ontology redesign, new app feature

### Complexity

Rate by what the change adds to the system's mental model:

| Rating     | Description                                           |
| ---------- | ----------------------------------------------------- |
| **None**   | Extends an existing pattern identically               |
| **Low**    | One new concept, isolated in its own file             |
| **Medium** | New concept that touches 2-3 existing stages          |
| **High**   | New concept that changes how existing stages interact |

### Maintenance burden

- **Zero**: Set-and-forget (static content, one-off scripts)
- **Low**: Needs updating when upstream changes (templates, rules)
- **Medium**: Has its own state or dependencies that can drift (integrations, caches)
- **High**: Requires active monitoring or regular human review (APIs, sync jobs)

## Reference Selection

Choose 2-3 references that would help someone evaluate the brief:

| Category      | Good references                                                              |
| ------------- | ---------------------------------------------------------------------------- |
| **Prior art** | Existing plan in `.cursor/plans/`, similar pattern in another Kanon instance |
| **Technical** | Library docs, framework guide, relevant API reference                        |
| **Evidence**  | Source files showing the current pain, build output showing the gap          |
| **External**  | Blog post, comparable project, design pattern documentation                  |

## Relationship to Other Skills

| Skill               | Relationship                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| **plan**            | A brief proposes; a plan executes. Brief first, then plan if approved.                                 |
| **assess-risk**     | Brief names costs loosely; assess-risk scores them precisely. Use after brief for high-stakes changes. |
| **create-ontology** | Many briefs will propose ontology changes — reference the current schema.                              |
