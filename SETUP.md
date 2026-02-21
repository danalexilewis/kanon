# Setup — Forking and customizing the template

This doc is for anyone who forks this repo to build their own knowledge system.

---

## The `Ingest → Sources → Docs` Pipeline

This template implements a three-stage knowledge pipeline:

1.  **Ingest Stage**: Raw material (any file type) is placed in `ingest/`. The `ingest` skill processes these files.
2.  **Sources Stage**: Processed content is normalized into canonical Markdown files in `sources/` (documents, chats, transcripts, media metadata). Reference materials (`references/`) are used by the `create-ontology` skill.
3.  **Docs Stage**: `sources/` and `ontology/ontology.md` are used by the `update-docs` skill to generate the final Fumadocs content in `content/`, which is then served by a Next.js app.

## Customizing the Ontology and Content

-   **Ontology Schema** — Define how knowledge is structured (entity types, frontmatter, sections) in `[ontology/ontology.md](ontology/ontology.md)`. This is the central schema contract for the knowledge base. Use the `create-ontology` skill to build or refine it, potentially using `references/` as input.
-   **`sources/` Content Layout** — Organize canonical Markdown files under `sources/documents/`, `sources/chats/`, `sources/transcripts/`, and `sources/media/`. Each file should adhere to the standardized frontmatter defined in the `sources.mdc` rule.
-   **`media/` Library** — Manage binary media assets in the top-level `media/` directory. Each asset should be in a `YYYY-MM-DD_short_descriptive_name/` subfolder with a `meta.md` file describing it.
-   **Fumadocs Output Layout (`content/`)** — The `content/` folder is the output of the `update-docs` skill. Its structure is dictated by `ontology/ontology.md` and `content/meta.json`. You can add or rename sections (e.g., `content/docs/`, `content/entities/`, `content/events/`, `content/narratives/`) and update the `meta.json` files so Fumadocs builds the site correctly (e.g., `pages` array).
-   **Glossary** — Optional: maintain `[ontology/glossary.md](ontology/glossary.md)` with preferred terms; the agent will prefer these when writing to `sources/` and `content/`.
-   **Corrections / Learnings** — Two types of correction stores:
    -   `[sources/corrections.md](sources/corrections.md)`: For normalizing raw text during the `ingest` skill (Ingest → Sources transformation).
    -   `[.cursor/corrections.md](.cursor/corrections.md)`: For global learnings/corrections applied when writing to `content/` (Sources → Docs transformation).

---

## Cursor Rules (summary)

This template leverages Cursor rules to guide the agent's behavior. Key rules include:

| Rule | When it applies | Purpose |
| :------------------------------ | :---------------------------------- | :------------------------------------------------------------------------------------------------- |
| **`folder-contract.mdc`** | Always | Defines the purpose and allowed operations within key directories. |
| **`ingest.mdc`** | Working with `ingest/**` | Ensures `ingest/` is append-only, specifies outputs to `sources/` and `media/`, and enforces manifest updates. |
| **`sources.mdc`** | Working with `sources/**` | Enforces Markdown-only, standardized frontmatter, and folder organization for canonical sources. |
| **`sources-corrections.mdc`** | During Ingest → Sources transformation | Defines `sources/corrections.md` for normalizing ingest text. |
| **`references.mdc`** | Working with `references/**` | Ensures `references/` is read-only. |
| **`media.mdc`** | Working with `media/**` | Defines the structure and `meta.md` contract for media assets in `media/`. |
| **`ontology.mdc`** | Working with `ontology/ontology.md`, `content/**` | Defines `ontology/ontology.md` as the schema contract and sets expectations for `content/` generation. |
| **`update-docs.mdc`** | During Sources → Docs transformation | Ensures `content/` is derived, `update-docs` is idempotent, and preserves protected sections. |
| **`corrections-content.mdc`** | Always (when writing to `content/`) | Defines `.cursor/corrections.md` for global corrections when generating `content/`.

---

## Hooks (optional)

This repo uses Cursor’s [hooks](https://cursor.com/changelog#hooks-beta) to automate reminders and workflow triggers:

-   **`afterFileEdit`** — If a relevant file (`ingest/`, `sources/`, `ontology/ontology.md`, `references/`, `media/`) is edited, a reminder is written to `.cursor/next-step.md` to run the appropriate skill (`ingest`, `create-ontology`, `update-docs`).
-   **`stop`** — When the task stops, it checks for unprocessed `ingest/` files or `sources/` files that have changed but haven't been reflected in `content/` (using `content/manifest.json`), and writes a suggestion to `.cursor/next-step.md`.

Scripts live in `.cursor/hooks/` and are driven by `.cursor/hooks.json`.

---

## Cursor Skills (available playbooks)

This repo also includes a set of Cursor skills in the `.cursor/skills/` directory to automate common workflows:

-   `ingest.md`: Processes raw files from `ingest/` into `sources/` and `media/`.
-   `ingest-force.md`: Re-processes all ingest files, useful for updates.
-   `create-ontology.md`: Builds or refines `ontology/ontology.md` from `references/` and user prompts.
-   `update-docs.md`: Generates/updates `content/` based on `sources/` and `ontology/ontology.md`.
---

## Fumadocs app (included)

This template includes a minimal **Fumadocs + Next.js** app that serves the `content/` folder:

-   **`source.config.ts`** — Single `defineDocs({ dir: 'content' })` collection; structure comes from `content/meta.json`.
-   **`app/docs/`** — Docs layout and catch-all page; `lib/source.ts` uses the generated `.source/server` and `loader()` from `fumadocs-core`.
-   **`npm run dev`** — Dev server; **`npm run build`** — Production build. The knowledge base is at **/docs**.

To use this repo as **content only** (e.g., in another Fumadocs project), point that project’s source at this repo’s `content/` and ensure **`content/meta.json`** (and per-folder `meta.json`) stay valid for the sidebar.
