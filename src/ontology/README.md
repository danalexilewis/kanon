# Ontology

This folder holds optional **glossary** and README. The **schema** (entity types, event types, doc sections, mapping to `content/`) is defined in **`.cursor/rules/ontology.mdc`**. The agent reads that rule to know how to write files under `content/`; it does not write canonical entity data here.

- **Glossary** — `glossary.md` for preferred terms; the agent prefers these when writing to `sources/` and `content/`.
- **Schema** — Lives in `.cursor/rules/ontology.mdc` (embedded YAML and rule text). Use the `create-ontology` skill to refine it.
