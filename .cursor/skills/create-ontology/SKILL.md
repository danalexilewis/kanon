# Create Ontology Skill

This skill reads reference materials from the `references/` directory and, guided by a user prompt, produces or updates the **ontology schema** embedded in **`.cursor/rules/ontology.mdc`**. That rule defines entity types, event types, relationships, and their mapping to `content/` folders. The skill may also add or update templates under `.cursor/skills/templates/`.

## Inputs

- Files under `references/` (PDFs, docs, etc.).
- User prompt (specifying ontology requirements, examples, or questions).
- Existing ontology schema in `.cursor/rules/ontology.mdc` (to update incrementally).

## Outputs

- Updated `.cursor/rules/ontology.mdc` (the embedded YAML schema block and any rule text).
- Optional files under `.cursor/skills/templates/` (e.g., entity or event templates).

## Key Behaviors

- **Schema Definition**: Translates user requirements and reference content into a structured ontology definition within the ontology rule. This includes defining entity types, their properties, relationships, event types, and how they map to documentation sections in `content/`.
- **Incremental Updates**: When the rule already contains an ontology block, the skill will update it by adding new definitions, refining existing ones, or adjusting relationships based on new references or prompts, while preserving existing, valid definitions.
- **Consistency**: Ensures the ontology is internally consistent and adheres to best practices for knowledge representation.
- **Template Generation**: Can create or update Markdown templates under `.cursor/skills/templates/` to guide `update-docs` or direct authoring.
