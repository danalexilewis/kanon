# Ontology (schema)

This folder defines the **schema** for the knowledge system: how entities, events, and docs are structured. The agent **reads** this to know how to write files under `content/`; it does **not** write canonical entity data here.

- **Rules and templates** — Define entity types, frontmatter fields, and section layout.
- **Glossary** (optional) — `glossary.md` or similar for preferred terms; the agent prefers these when writing to `content/`.
- **Section descriptions** — Short READMEs or docs that describe what belongs in each part of `content/` (e.g. `content/entities/`, `content/events/`).

You can keep this folder minimal and put schema only in `.cursor/rules/` if you prefer.
