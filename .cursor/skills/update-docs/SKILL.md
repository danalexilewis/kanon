---
name: update-docs
description: Generate or update content/ from src/sources/ and the ontology schema. Use after source or ontology changes, or when the user asks to update docs.
paths: content/**
---

# Update Docs Skill

Reads canonical sources from `src/sources/` and the ontology schema in `.cursor/rules/ontology.mdc`, then generates or updates derived Fumadocs content under `content/`.

## Inputs

- Markdown from `src/sources/documents/`, `src/sources/chats/`, `src/sources/transcripts/`.
- Ontology schema in `.cursor/rules/ontology.mdc`.
- Media in `public/media/` (referenced via repo-root paths in sources).
- `content/manifest.json` (optional staleness tracking).
- Existing files under `content/` (incremental updates).

## Outputs

- Markdown or MDX in `content/docs/`, `content/entities/`, `content/events/`, and ontology-defined sections.
- Updated `content/meta.json` and `content/**/meta.json` for navigation.

## Key Behaviors

- **Idempotency**: Re-run updates existing files; no duplicates.
- **Overwrite**: Derived sections are managed by this skill; preserve `<!-- AGENT_PROTECTED_START -->` / `<!-- AGENT_PROTECTED_END -->` markers.
- **Provenance**: Link each `content/` file back to `src/sources/` IDs.
- **Ontology**: Strict adherence to `.cursor/rules/ontology.mdc`.

## Media embedding

See [references/media-embedding.md](references/media-embedding.md).

## Templates

Entity/event templates live in [references/templates/](references/templates/).
