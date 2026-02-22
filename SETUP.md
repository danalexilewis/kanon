# Setup — Forking and customizing the template

This doc is for anyone who forks this repo to build their own knowledge system. For this repo's status and v1 decisions, see [milestone v1 reflection](docs/milestone-v1-reflection_2026-02-22.plan.md).

---

## The `Ingest → Sources → Docs` Pipeline

This template implements a three-stage knowledge pipeline:

1. **Ingest Stage**: Raw material (any file type) is placed in `src/ingest/`. The `ingest` skill processes these files.
2. **Sources Stage**: Processed content is normalized into canonical Markdown files in `src/sources/` (documents, chats, transcripts, media metadata). Reference materials (`src/references/`) are used by the `create-ontology` skill.
3. **Docs Stage**: `src/sources/` and the ontology schema in `.cursor/rules/ontology.mdc` are used by the `update-docs` skill to generate the final Fumadocs content in `content/`, which is then served by a Next.js app.

## Customizing the Ontology and Content

- **Ontology Schema** — The schema (entity types, frontmatter, sections) is defined in **`.cursor/rules/ontology.mdc`**. This is the central contract for the knowledge base. Use the `create-ontology` skill to build or refine the embedded schema in that rule, potentially using `src/references/` as input. Use a high-reasoning model when developing your ontology; the template doesn't prescribe which one.
- **`src/sources/` Content Layout** — Organize canonical Markdown files under `src/sources/documents/`, `src/sources/chats/`, `src/sources/transcripts/`, and `src/sources/media/`. Each file should adhere to the standardized frontmatter defined in the `sources.mdc` rule.
- **`public/media/` Library** — Manage binary media assets in `public/media/`. Each asset should be in a `YYYY-MM-DD_short_descriptive_name/` subfolder with a `meta.md` file describing it.
- **Fumadocs Output Layout (`content/`)** — The `content/` folder is the output of the `update-docs` skill. Its structure is dictated by the ontology schema in `.cursor/rules/ontology.mdc` and `content/meta.json`. You can add or rename sections (e.g., `content/docs/`, `content/entities/`, `content/events/`, `content/narratives/`) and update the `meta.json` files so Fumadocs builds the site correctly (e.g., `pages` array).
- **Glossary** — Optional: maintain `src/ontology/glossary.md` with preferred terms; the agent will prefer these when writing to `src/sources/` and `content/`.
- **Corrections / Learnings** — Two types of correction stores:
  - `src/sources/corrections.md`: For normalizing raw text during the `ingest` skill (Ingest → Sources transformation).
  - `.cursor/corrections.md`: For global learnings/corrections applied when writing to `content/` (Sources → Docs transformation).

---

## Cursor Rules (summary)

This template leverages Cursor rules to guide the agent's behavior. Key rules include:

| Rule | When it applies | Purpose |
| :------------------------------ | :---------------------------------- | :------------------------------------------------------------------------------------------------- |
| **`folder-contract.mdc`** | Always | Defines the purpose and allowed operations within key directories. |
| **`ingest.mdc`** | Working with `src/ingest/**` | Ensures `src/ingest/` is append-only, specifies outputs to `src/sources/` and `public/media/`, and enforces manifest updates. |
| **`sources.mdc`** | Working with `src/sources/**` | Enforces Markdown-only, standardized frontmatter, and folder organization for canonical sources. |
| **`sources-corrections.mdc`** | During Ingest → Sources transformation | Defines `src/sources/corrections.md` for normalizing ingest text. |
| **`references.mdc`** | Working with `src/references/**` | Ensures `src/references/` is read-only. |
| **`media.mdc`** | Working with `public/media/**` | Defines the structure and `meta.md` contract for media assets in `public/media/`. |
| **`ontology.mdc`** | Working with `src/ontology/**`, `content/**` | Defines the ontology schema (embedded in the rule) and sets expectations for `content/` generation. |
| **`update-docs.mdc`** | During Sources → Docs transformation | Ensures `content/` is derived, `update-docs` is idempotent, and preserves protected sections. |
| **`corrections-content.mdc`** | Always (when writing to `content/`) | Defines `.cursor/corrections.md` for global corrections when generating `content/`.

---

## Hooks (optional)

This repo uses Cursor's [hooks](https://cursor.com/changelog#hooks-beta) to automate reminders and workflow triggers:

- **`afterFileEdit`** — If a relevant file (`src/ingest/`, `src/sources/`, `.cursor/rules/ontology.mdc`, `src/references/`, `public/media/`) is edited, a reminder is written to `.cursor/next-step.md` to run the appropriate skill (`ingest`, `create-ontology`, `update-docs`).
- **`stop`** — When the task stops, it checks for unprocessed `src/ingest/` files or `src/sources/` files that have changed but haven't been reflected in `content/` (using `content/manifest.json`), and writes a suggestion to `.cursor/next-step.md`.

Scripts live in `.cursor/hooks/` and are driven by `.cursor/hooks.json`.

---

## Cursor Skills (available playbooks)

This repo also includes Cursor skills in `.cursor/skills/`. Each skill is in its own folder with a `SKILL.md` file so Cursor can load it:

- `ingest/SKILL.md`: Processes raw files from `src/ingest/` into `src/sources/` and `public/media/`.
- `ingest-force/SKILL.md`: Re-processes all ingest files, useful for updates.
- `create-ontology/SKILL.md`: Builds or refines the ontology schema in `.cursor/rules/ontology.mdc` from `src/references/` and user prompts.
- `update-docs/SKILL.md`: Generates/updates `content/` based on `src/sources/` and the ontology schema in `.cursor/rules/ontology.mdc`.
- `templates/`: Shared entity/event templates used by the ontology and update-docs flow.

---

## Fumadocs app (included)

This template includes a minimal **Fumadocs + Next.js** app that serves the `content/` folder:

- **`source.config.ts`** — Single `defineDocs({ dir: 'content' })` collection; structure comes from `content/meta.json`.
- **`app/docs/`** — Docs layout and catch-all page; `lib/source.ts` uses the generated `.source/server` and `loader()` from `fumadocs-core`.
- **`npm run dev`** — Dev server; **`npm run build`** — Production build. The knowledge base is at **/docs**.

To use this repo as **content only** (e.g., in another Fumadocs project), point that project's source at this repo's `content/` and ensure **`content/meta.json`** (and per-folder `meta.json`) stay valid for the sidebar.

---

## Plans and design docs

Implementation plans (feature plans, migration notes, technical design) live in **`plans/`**; when we create or finalize a plan, we keep a copy there for reference. Reflections and longer design docs live in **`docs/`** (e.g. [milestone v1 reflection](docs/milestone-v1-reflection_2026-02-22.plan.md)).

---

## Build, stack, and developer notes

Notes for anyone working on the repo or debugging build/dev.

### Build and dev (Next.js 16)

- **`pnpm run dev`** uses **Turbopack** (Next 16 default). Fast local dev.
- **`pnpm run build`** uses **Webpack** (`next build --webpack`). We opt out of Turbopack for production builds because **@serwist/turbopack** currently fails during "Collecting page data" when Next 16 uses Turbopack for build. Serwist's route handler works with Webpack. When Serwist supports Next 16's Turbopack build, we can drop the `--webpack` flag.

### Stack

- **Next.js** 16, **React** 19
- **Fumadocs** 16 (fumadocs-ui, fumadocs-core); fumadocs-mdx 14 (no v16)
- **Tailwind** v4, CSS-first config; Fumadocs theme via `fumadocs-ui/css/neutral.css` + `preset.css`
- **Twoslash** (fumadocs-twoslash) for TypeScript code blocks in MDX
- **Serwist** (@serwist/turbopack) for PWA / offline

### Fumadocs v16 import paths

- Root provider: `fumadocs-ui/provider/next` (not `fumadocs-ui/provider`)
- Docs layout: `fumadocs-ui/layouts/docs` (not `fumadocs-ui/layout`)

### Where content lives

- **Source of truth:** `src/sources/` and ontology in `.cursor/rules/ontology.mdc`
- **Derived output:** `content/` (Fumadocs) — generated by the `update-docs` skill; do not edit by hand for anything that should stay in sync with sources.
