# About this ontology

Kanon ships with a **starter ontology** — a small schema most knowledge bases build from. You can keep it, extend it, or delete it entirely.

## The core foundation

The starter schema models two layers:

- **Person** and **Organization** — the CRM-like core. People belong to organizations (many-to-many); most knowledge graphs start here.
- **Interaction** — any recorded exchange between people and/or organizations. The `type` field distinguishes meetings, phone calls, emails, chats, purchases, invoices, and receipts.

Interactions are the primary incoming data feed. Transcripts, chat logs, emails, and documents usually describe _something that happened_ between people and organizations. Intel is harvested from interactions into entity records and user-defined schema (e.g. a Tasks register populated from meeting notes).

## Extending the schema

Most users extend this base with domain-specific types:

- Project management: `Project`, `Task`, `Milestone`
- Storytelling: `Character`, `Location`, `PlotThread`
- Risk & sentiment: `Concern`, `Risk`, `Sentiment`

Use the `create-ontology` skill to refine `.cursor/rules/ontology.mdc`. The schema graph and inspector in this dev tool update automatically when you change the YAML.

## You can delete the starter types

If Person, Organization, and Interaction don't fit your domain, remove them from `.cursor/rules/ontology.mdc` and define your own types from scratch. The pipeline (`create-ontology` → `ingest` → `update-docs`) works with any schema you define.

## Where things live

| What               | Where                        |
| ------------------ | ---------------------------- |
| Schema contract    | `.cursor/rules/ontology.mdc` |
| This documentation | `src/ontology/about.md`      |
| Glossary terms     | `src/ontology/glossary.md`   |
| Canonical sources  | `src/sources/`               |
| Published content  | `content/`                   |
