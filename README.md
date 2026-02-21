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

## Protection modes checklist

Use these modes to keep the pipeline non-destructive and predictable.

### Safe mode (guardrails first)

- [ ] Activate: `npm run mode:safe`.
- [ ] Hook behavior: edits in non-manifest `ingest/**` and risky `content/**` edits emit **stop-and-revert guidance** in `.cursor/next-step.md`.
- [ ] Operator behavior: do not overwrite derived output manually; use skills (`ingest`, `update-docs`) to make changes.

### Normal mode (day-to-day operation)

- [ ] Activate: `npm run mode:normal`.
- [ ] Hook behavior: warnings/reminders are advisory so normal workflows remain fast.
- [ ] Operator behavior: run `ingest` for raw inputs, update `sources/`/`ontology/`, then run `update-docs`.

### Force mode (exception path only)

- [ ] Activate: `npm run mode:force`.
- [ ] Confirm risky edits by creating `.cursor/force-mode-confirmation.md` containing `CONFIRM FORCE MODE`.
- [ ] Use only when normal mode cannot resolve drift; record forced actions in commit/PR notes.

---

## Restore playbook

When in doubt, restore from canonical truth instead of patching generated docs by hand.

1. **Locate rollback truth:**
   - Canonical content truth: `sources/**`.
   - Schema truth: `ontology/ontology.md`.
   - Ingest processing history: `ingest/manifest.json` and `ingest/manifest.md`.
2. **Regenerate published docs:** run the `update-docs` skill so `content/**` is rebuilt from `sources/**` + `ontology/ontology.md`.
3. **Never manually edit these unless you are intentionally changing system behavior:**
   - `ingest/**` files other than `ingest/manifest.json` and `ingest/manifest.md`.
   - Generated `content/**` when it disagrees with canonical `sources/**` or `ontology/ontology.md`.

---

## Automatic destructive-intent warnings

The `afterFileEdit` hook now reads `.cursor/protection-mode.json` and writes mode-aware warnings to `.cursor/next-step.md` when:

- a tool edits `ingest/**` files other than `ingest/manifest.json` and `ingest/manifest.md`,
- a tool edits generated `content/**` while `sources/**` changes are still unapplied.

In **safe mode**, warnings include explicit "stop and revert" actions. In **force mode**, risky edits require `.cursor/force-mode-confirmation.md` with `CONFIRM FORCE MODE`.

---

## How this works in Cursor

1. Set the active mode (`safe`, `normal`, or `force`) via npm script.
2. Keep working as usual in Cursor; hooks run after each file edit.
3. Read `.cursor/next-step.md` for mode-aware warnings and recommended next skill.
4. If warnings indicate source/derived drift, run `update-docs` instead of hand-editing generated `content/**`.

```bash
npm run mode:safe
npm run mode:normal
npm run mode:force
```

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
-   **`.cursor/protection-mode.json`** — Active protection mode (`safe`, `normal`, `force`) consumed by hooks.
-   **`.cursor/force-mode-confirmation.md`** — Optional explicit force confirmation token (`CONFIRM FORCE MODE`).
-   **`.cursor/hooks.json`**, **`.cursor/hooks/after-file-edit.js`**, **`.cursor/hooks/on-stop.js`** — Updated hooks for workflow automation.

See **`SETUP.md`** for forking, customizing the ontology, and Fumadocs options.
