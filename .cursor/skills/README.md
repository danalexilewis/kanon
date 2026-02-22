# Cursor Skills

Each skill lives in its own folder with a **`SKILL.md`** file so Cursor can load it. Shared templates used by the ontology and update-docs flow live in **`templates/`**.

| Skill folder       | Purpose |
|--------------------|--------|
| **`ingest/`**      | Process raw files from `src/ingest/` into `src/sources/` and `src/media/`; update manifests. |
| **`ingest-force/`**| Re-process all ingest files (idempotent). |
| **`create-ontology/`** | Build or refine the ontology schema in `.cursor/rules/ontology.mdc` from `src/references/` and user prompts. |
| **`update-docs/`**  | Generate/update `content/` from `src/sources/` and the ontology schema. |
| **`templates/`**    | Shared entity/event templates (e.g. `person-entity.md`, `meeting-event.md`). |
