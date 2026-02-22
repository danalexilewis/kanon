# Kanon — Ingest → Sources → Ontology (Fumadocs) template

**Kanon** is Swedish for the same word as English *canon* — and it has three meanings that fit this project:

1. **A canon of work** — The body of accepted, authoritative sources. This template is built around canonical sources in `src/sources/` and a clear ontology.
2. **A cannon** — In Swedish, *kanon* is also the word for the big guns on pirate ships. We launch our content into the world like cannonballs :)
3. **Great** — Colloquially, *kanon* means “great” or “really good” (e.g. *Det var kanon!* = “That was great!”).

**How to say it (Swedish accent):** Stress the first syllable: **KAH-nohn**. The *a* is an open “ah” (like in “father”), and the *o* is a long Swedish *o*, somewhat like the vowel in “go” but more rounded. So: *KAH-nohn*, not “kuh-NON” or “KAY-nun”.

---

A Cursor-based **ingest → sources → ontology** template for building a **knowledge system** (not code): immutable ingest, canonical sources, a user-defined ontology (schema), and **processed output written into a Fumadocs content folder** so the knowledge base can be served as a Fumadocs site.

---

## Where to look: `src/` is for you

**Non-technical users:** Everything you need to add or edit lives under **`src/`**:

- **`src/ingest/`** — Drop raw material here (transcripts, notes, meeting dumps). Append-only; don’t edit files here except to add new ones.
- **`src/sources/`** — Canonical Markdown sources. Edit these or let the ingest skill populate them.
- **`src/references/`** — Reference material (PDFs, docs). Read-only; used when building the ontology.
- **`public/media/`** — Media library (images, videos). Each item in its own folder with a `meta.md`.
- **`src/ontology/`** — Optional glossary and README. The *schema* lives in `.cursor/rules/ontology.mdc`; the agent reads that to generate `content/`.

Don’t touch the rest of the repo unless you’re changing how the system works. The site is built from **`content/`**, which is generated from `src/sources/` and the ontology.

---

## Getting started

**Do this order:** Your ontology defines what your knowledge base *is*; ingest fills it. So:

1. **Ontology first** — Define or refine the schema. Add reference material to `src/references/` (formal docs, notes, or transcripts — whatever best describes how you want your knowledge base structured; the template doesn't weight them). Run the **create-ontology** skill so the agent can build or update the schema in `.cursor/rules/ontology.mdc`.

   Cursor prompt:

   ```text
   /create-ontology [add any other text instructions here]
   ```

2. **Then ingest** — Add raw material to `src/ingest/`, then run the **ingest** skill to normalize it into `src/sources/` and `public/media/`.

   Cursor prompt:

   ```text
   /ingest
   ```

3. **Then docs** — Run the **update-docs** skill to generate `content/` from your sources and ontology, then run the site (see **Run the site** below).

   Cursor prompt:

   ```text
   /update-docs
   ```

### Run the site

**Option A — Ask an agent:** Paste this Cursor prompt so the agent installs deps and starts the dev server:

```text
Install dependencies (pnpm) and run the dev server for this repo. Use `pnpm run dev`. Tell me when the server is up and what URL to open.
```

**Option B — Do it yourself:**

```bash
pnpm install
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000); the knowledge base is at [/docs](http://localhost:3000/docs).

See **Workflow** below for the full step-by-step.

---

## Three Stages, Five Key Folders (under `src/`)

This template implements a three-stage knowledge pipeline. User-facing content lives under **`src/`**:

1. **Ingest Stage:** Raw material is dumped and tracked.

- `src/ingest/`: Raw input only (transcripts, notes, meeting dumps). **Append-only:** the agent must not edit or delete any file here except `src/ingest/manifest.json` and `src/ingest/manifest.md`, which record which ingest files have been processed. All other ingest files are read-only.

2. **Sources Stage:** Raw material is normalized into canonical, user-editable Markdown.

- `src/sources/`: The canonical, normalized “user-created” source corpus (Markdown only, with frontmatter). The agent outputs to `src/sources/` when running the `ingest` or `ingest-force` skills.
- `src/references/`: Non-user-created reference material (PDFs, docs, links). Read-only; used as context when building the ontology. The agent updates the ontology schema in `.cursor/rules/ontology.mdc` when running `create-ontology`.
- `public/media/`: Shared media library for binary assets (images, videos, etc.). Managed by the agent and linked from `src/sources/` and `content/`.

3. **Docs Stage (Fumadocs Output):** Canonical sources are rendered into a published knowledge base.

- `src/ontology/`: Optional glossary and README. The **schema** (entity types, event types, doc sections) lives in **`.cursor/rules/ontology.mdc`**. The agent **reads** that rule to know how to write `content/`.
- `content/`: **Fumadocs content folder.** All processed output (the actual ontology *content*) is written here. The agent creates and updates markdown (or MDX) only under `content/` when running the `update-docs` skill.

---

## Workflow

1. **Add** raw material to `src/ingest/`. The `afterFileEdit` hook will remind you to run the `ingest` skill.
2. **Run** the `ingest` skill to process files from `src/ingest/` into `src/sources/` and `public/media/`, and update `src/ingest/manifest.json` and `src/ingest/manifest.md`.
3. **Add** reference material to `src/references/` (optional). The `afterFileEdit` hook will remind you to run `create-ontology`.
4. **Run** the `create-ontology` skill (using `src/references/` and a user prompt) to define or refine the schema in `.cursor/rules/ontology.mdc`.
5. **Edit** `src/sources/` files directly or ensure they are up-to-date after ingest. The `afterFileEdit` hook will remind you to run `update-docs`.
6. **Run** the `update-docs` skill to generate/update the Fumadocs content under `content/` based on `src/sources/` and the ontology schema in `.cursor/rules/ontology.mdc`.
7. **Result:** `src/sources/`, `public/media/`, and `content/` are updated. The site can be built from `content/` with Fumadocs.

---

## Source of truth

If content under `content/` and `src/sources/` (or the ontology schema in `.cursor/rules/ontology.mdc`) disagree, **`src/sources/` or the ontology rule** is the source of truth. Update the file under `content/` to match; do not edit `src/sources/` directly if it's derived, and do not edit `src/ingest/`.

---

## Ingest folder protection

`src/ingest/` is append-only: add new files for new input; do not edit or delete existing ingest files (only `manifest.json` and `manifest.md` are updated by the **ingest** skill). If the agent edits any non-manifest file there, a hook **reverts those edits** and writes to `.cursor/next-step.md` telling the agent to make no further edits to that folder. No scripts or modes to configure.

---

## Restore playbook

When in doubt, restore from canonical truth instead of patching generated docs by hand.

1. **Locate rollback truth:**

- Canonical content truth: **`src/sources/`**.
- Schema truth: `.cursor/rules/ontology.mdc` (ontology rule).
- Ingest processing history: `src/ingest/manifest.json` and `src/ingest/manifest.md`.

2. **Regenerate published docs:** run the `update-docs` skill so `content/` is rebuilt from `src/sources/` and the ontology schema in `.cursor/rules/ontology.mdc`.
3. **Never manually edit these unless you are intentionally changing system behavior:**

- `src/ingest/**` files other than `src/ingest/manifest.json` and `src/ingest/manifest.md`.
- Generated `content/**` when it disagrees with canonical `src/sources/**` or the ontology schema.

---

## How this works in Cursor

1. Hooks run after each file edit. If the agent edits `src/ingest/` (other than the manifest), a hook reverts those edits and writes to `.cursor/next-step.md`.
2. Read `.cursor/next-step.md` for reminders (e.g. run **ingest** for new files, **update-docs** after source/ontology changes).
3. If you see source/derived drift, run **update-docs** instead of hand-editing `content/`.

## Run the site

This repo includes a minimal **Fumadocs (Next.js)** app that serves the `content/` folder. For install/run commands and a prompt you can give an agent, see **Getting started** above.

---

## Repo layout highlights

- **`src/`** — User-facing content: ingest, sources, references, ontology. Non-technical users work here.
- `**src/ingest/manifest.json**` — Machine-readable status of processed ingest files (updated by the agent).
- `**src/ingest/manifest.md**` — Human-readable table of processed ingest files (generated from JSON).
- `**src/sources/corrections.md**` — Learnings/corrections applied during `ingest` (Ingest → Sources normalization).
- `**.cursor/rules/ontology.mdc**` — The ontology schema (entity types, event types, doc sections); the central contract for the knowledge base.
- `**content/manifest.json**` — Optional: tracks which `src/sources/**` hashes have been applied to `content/**` for staleness detection.
- `**content/meta.json**` — Fumadocs root meta; the site is built from `content/`.
- `**source.config.ts**` — Fumadocs MDX config (single collection: `content/`).
- `**app/**` — Next.js app (Fumadocs UI); docs at `/docs/[[...slug]]`.
- `**.cursor/skills/**` — Cursor skills (each in its own folder with `SKILL.md`): `ingest/`, `ingest-force/`, `create-ontology/`, `update-docs/`; shared `templates/`.
- `**.cursor/rules/**` — Contains the new rule set (`folder-contract.mdc`, `ingest.mdc`, `sources.mdc`, `sources-corrections.mdc`, `references.mdc`, `media.mdc`, `ontology.mdc`, `update-docs.mdc`, `corrections-content.mdc`).
- `**.cursor/corrections.md**` — Global learnings/corrections the agent applies when writing to `content/`.
- `**.cursor/next-step.md**` — Reminders (e.g., unprocessed ingest, stale docs; written by hooks or the agent).
- `**.cursor/hooks.json**`, `**.cursor/hooks/after-file-edit.js**`, `**.cursor/hooks/revert-ingest-if-edited.js**`, `**.cursor/hooks/on-stop.js**` — Hooks for workflow automation and ingest-folder protection.

See **SETUP.md** for forking, customizing the ontology, and Fumadocs options. See [milestone v1 reflection](docs/milestone-v1-reflection_2026-02-22.plan.md) for project status and decisions.
