---
name: create-ontology
description: Build or refine the ontology schema in .cursor/rules/ontology.mdc from src/references/ and user prompts. Use when defining or updating the knowledge base structure.
paths: src/ontology/**, src/references/**, .cursor/rules/ontology.mdc
---

# Create Ontology Skill

Reads reference materials from `src/references/` and, guided by a user prompt, produces or updates the **ontology schema** embedded in **`.cursor/rules/ontology.mdc`**. May add templates under `update-docs/references/templates/`.

**Model:** Use a high-reasoning model when developing your ontology.

## Inputs

- Files under `src/references/` (PDFs, docs, etc.).
- User prompt (requirements, examples, questions).
- Existing schema in `.cursor/rules/ontology.mdc` (incremental updates).

## Outputs

- Updated `.cursor/rules/ontology.mdc` (embedded YAML schema and rule text).
- Optional templates in `.cursor/skills/update-docs/references/templates/`.

## Key Behaviors

- **Schema definition**: Entity types, properties, relationships, event types, and `content/` folder mapping.
- **Incremental updates**: Add, refine, or adjust; preserve valid existing definitions.
- **Consistency**: Internally consistent ontology aligned with knowledge-representation best practices.
- **Templates**: Create or update Markdown templates to guide `update-docs`.
