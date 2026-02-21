# Docstilled — Ingest → Sources → Ontology (Fumadocs) template

A Cursor-based **ingest → sources → ontology** template for building a **knowledge system** (not code): immutable ingest, canonical sources, a user-defined ontology (schema), and **processed output written into a Fumadocs content folder** so the knowledge base can be served as a Fumadocs site.

---

## Three Stages, Five Key Folders

This template implements a three-stage knowledge pipeline, managed by five key top-level folders:

1.  **Ingest Stage:** Raw material is dumped and tracked.
    -   `ingest/`: Raw input only (transcripts, notes, meeting dumps). **Append-only:** the agent must not edit or delete any file here except `ingest/manifest.json` and `ingest/manifest.md`, which record which ingest files have been processed. All other ingest files are read-only.

2.  **Sources Stage:** Raw material is normalized into canonical, user-editable Markdown.
    -   `sources/`: The canonical, normalized “user-created” source corpus (Markdown only, with frontmatter). The agent outputs to `sources/` when running the `ingest` or `ingest-force` skills.
    -   `references/`: Non-user-created reference material (PDFs, docs, links). Read-only; used as context when building the ontology. The agent outputs to `ontology/ontology.md` when running `create-ontology`.
    -   `media/`: Shared, top-level media library for binary assets (images, videos, etc.). Managed by the agent and linked from `sources/` and `content/`.

3.  **Docs Stage (Fumadocs Output):** Canonical sources are rendered into a published knowledge base.
    -   `ontology/`: The **schema** only: `ontology/ontology.md` (the main contract for the knowledge base) and optional `templates/`. The agent **reads** this to know how to write `content/`.
    -   `content/`: **Fumadocs content folder.** All processed output (the actual ontology *content*) is written here. The agent creates and updates markdown (or MDX) only under `content/` when running the `update-docs` skill.

---

## Workflow

1.  **Add** raw material to `ingest/`. The `afterFileEdit` hook will remind you to run the `ingest` skill.
2.  **Run** the `ingest` skill to process files from `ingest/` into `sources/` and `media/`, and update `ingest/manifest.json` and `ingest/manifest.md`.
3.  **Add** reference material to `references/` (optional). The `afterFileEdit` hook will remind you to run `create-ontology`.
4.  **Run** the `create-ontology` skill (using `references/` and a user prompt) to define or refine the schema in `ontology/ontology.md`.
5.  **Edit** `sources/` files directly or ensure they are up-to-date after ingest. The `afterFileEdit` hook will remind you to run `update-docs`.
6.  **Run** the `update-docs` skill to generate/update the Fumadocs content under `content/` based on `sources/` and `ontology/ontology.md`.
7.  **Result:** `sources/`, `media/`, and `content/` are updated. The site can be built from `content/` with Fumadocs.

---

## Source of truth

If content under `content/` and `sources/` (or `ontology/ontology.md`) disagree, **`sources/` (or `ontology/`) is the source of truth**. Update the file under `content/` to match `sources/` (or `ontology/`); do not edit `sources/` directly if it's derived, and do not edit `ingest/`.

---

## Run the site

This repo includes a minimal **Fumadocs (Next.js)** app that serves the `content/` folder:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000); the knowledge base is at [/docs](http://localhost:3000/docs).

---

## Repo layout highlights

-   **`ingest/manifest.json`** — Machine-readable status of processed ingest files (updated by the agent).
-   **`ingest/manifest.md`** — Human-readable table of processed ingest files (generated from JSON).
-   **`sources/corrections.md`** — Learnings/corrections applied during `ingest` (Ingest → Sources normalization).
-   **`ontology/ontology.md`** — The central schema contract for the knowledge base.
-   **`content/manifest.json`** — Optional: tracks which `sources/**` hashes have been applied to `content/**` for staleness detection.
-   **`content/meta.json`** — Fumadocs root meta; the site is built from `content/`.
-   **`source.config.ts`** — Fumadocs MDX config (single collection: `content/`).
-   **`app/`** — Next.js app (Fumadocs UI); docs at `/docs/[[...slug]]`.
-   **`.cursor/skills/`** — Repo-native skill playbooks (Markdown files for `ingest`, `ingest-force`, `create-ontology`, `update-docs`).
-   **`.cursor/rules/`** — Contains the new rule set (`folder-contract.mdc`, `ingest.mdc`, `sources.mdc`, `sources-corrections.mdc`, `references.mdc`, `media.mdc`, `ontology.mdc`, `update-docs.mdc`, `corrections-content.mdc`).
-   **`.cursor/corrections.md`** — Global learnings/corrections the agent applies when writing to `content/`.
-   **`.cursor/next-step.md`** — Reminders (e.g., unprocessed ingest, stale docs; written by hooks or the agent).
-   **`.cursor/hooks.json`**, **`.cursor/hooks/after-file-edit.js`**, **`.cursor/hooks/on-stop.js`** — Updated hooks for workflow automation.

See **`SETUP.md`** for forking, customizing the ontology, and Fumadocs options.
