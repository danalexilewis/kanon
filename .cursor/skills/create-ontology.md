# Create Ontology Skill (skills/create-ontology.md)

This skill reads reference materials from the `references/` directory and, guided by a user prompt, produces or updates the `ontology/ontology.md` file. This file defines the schema, structure, entity types, event types, and relationships for the knowledge base. It may also generate optional templates under `ontology/templates/`.

## Inputs
- Files under `references/` (PDFs, docs, etc.).
- User prompt (specifying ontology requirements, examples, or questions).
- Existing `ontology/ontology.md` (to update incrementally).

## Outputs
- `ontology/ontology.md` (the main ontology schema).
- Optional files under `ontology/templates/` (e.g., `entity-template.md`, `event-template.md`).

## Key Behaviors
- **Schema Definition**: Translates user requirements and reference content into a structured ontology definition within `ontology/ontology.md`. This includes defining entity types, their properties, relationships, event types, and how they map to documentation sections in `content/`.
- **Incremental Updates**: When `ontology/ontology.md` already exists, the skill will update it by adding new definitions, refining existing ones, or adjusting relationships based on new references or prompts, while preserving existing, valid definitions.
- **Consistency**: Ensures the ontology is internally consistent and adheres to best practices for knowledge representation.
- **Template Generation**: Can create Markdown templates for different entity or document types under `ontology/templates/` to guide `update-docs` or direct authoring.
