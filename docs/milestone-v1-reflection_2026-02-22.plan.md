# Kanon v1 / beta milestone reflection (deepened)

**Date:** 2026-02-22  
**Purpose:** Sense-check where the project has landed, clarify *why it exists*, and add forward-facing intelligence on where it could go next — especially for **non-technical users** building ontology-based knowledge bases in **real tools** (Cursor + Git + Markdown).

---

## 1. What Kanon is (intentionality)

- **Template for a knowledge system**, not an app: ingest → sources → ontology-driven content → Fumadocs site.
- **ELT, not ETL:** Extract (raw into ingest), **Load** into canonical sources (normalized Markdown + media), **Transform** into `content/` using the ontology. Sources are “cleaned up,” not “processed” — the transform step is where structure and interpretation live.
- **Offline-first:** PWA (Serwist), cached docs and media so the knowledge base works on the bus / in weird buildings. Images and audio are downloaded into `public/media/`; video stays as URL and is clearly “not available offline” in the UI.
- **Ontology as contract:** The schema in `.cursor/rules/ontology.mdc` drives what gets generated under `content/`. The system doesn’t dictate what makes a “good” ontology; it relies on the user and the LLM. High-reasoning models are the right tool for ontology work; which one is best may need research.
- **Corrections split:** Ingest→sources normalization lives in `src/sources/corrections.md`; content-generation corrections in `.cursor/corrections.md`. Clear separation of concerns.
- **Ambition for users:** A **GitHub template** that a **non-developer** (with light facilitation: GitHub account, Cursor account, clone repo) can use by following the README. First major step: **ontology**. Then ingest. So: ontology first, then populate.

### 1.1 The “context engineering” frame (why this matters)

Kanon is a practical answer to the thing your team (and most teams) keep running into: **prompting isn’t the bottleneck, context is**.

- **Prompt engineering** is mostly “how you ask” in one interaction.
- **Context engineering** is “what the model can reliably see” across time: curated sources, stable rules/contracts, retrieval boundaries, and provenance.

Kanon is intentionally designed as a *context engineering template*: it turns scattered artifacts (docs, transcripts, links, media) into a durable, inspectable context system (sources + ontology + derived site) that you can reuse without copy/paste debt.

---

## 2. Why this exists (origin story) and who it’s for

Kanon started as a response to a pattern inside **Eddyworks**: non-technical teammates were already using ChatGPT / Gemini / NotebookLM, but they kept hitting the same ceiling — **context engineering**.

- The work degraded into **copy/paste context shuffling** across web GUIs.
- “Knowledge” became fragile: artifacts existed, but not as a coherent, versioned, offline-available corpus.
- People repeatedly lost time to: “where is the latest source?” and “what’s the right context to paste?”

An Inspiral retreat experience (Joshua Vile / “Code with JV”) reinforced an unlock: with light facilitation, non-technical people can move from web GUIs into “real” workflows surprisingly fast — if the scaffolding is clear and the experience is forgiving.

### 2.1 Primary persona: non-technical knowledge workers (Eddyworks)

Needs:

- A durable place to put *their* sources (docs, transcripts, notes) without copy/paste debt.
- A way to ask better questions because the context is **structured + retrievable**.
- A workflow that survives bad connectivity and doesn’t depend on a vendor UI.

### 2.2 Secondary persona: consultants / facilitators (methodologies as ontologies)

Your examples (Frederick; Manuel / New Work by Design and GPS/infinite games) are a strong fit for **method-as-ontology**:

- The ontology encodes the stable objects of the method (goals, positions, strategies, decisions, experiments, risks, etc.).
- Client inputs become sources.
- Outputs become consistent deliverables (briefs, recaps, narrative pages, entity pages).

### 2.3 Tertiary persona: hobby knowledge bases (e.g., complex TTRPG campaigns)

Invisible Sun is a great example of a domain that effectively *ships an ontology* (the books define the world). With a light ontology + ingest, you can build:

- NPC/faction/location pages (entities)
- session log / timeline (events)
- plot threads + “key moments” (narratives)

Constraint to embrace: don’t treat messy group audio as a stats engine. Use the system for **narrative continuity** and collective memory, not numeric correctness.

---

## 3. Where we’ve gotten to (v1 / beta)

| Area | Status |
|------|--------|
| **Pipeline** | Ingest → sources (documents/chats/transcripts) → `content/` via update-docs; references → create-ontology → `.cursor/rules/ontology.mdc`. |
| **Media** | Images/audio URLs → download to `public/media/` with `meta.json`; video URLs kept; sources and content reference correctly; ImageZoom, AudioPlayer, VideoPlayer (offline-aware). |
| **Offline** | Serwist PWA; offline badge; fallback to home when doc not cached; build uses Webpack for Serwist compatibility (see plans/README). |
| **Protection** | Ingest append-only enforced by hook (revert + next-step); no safe/normal/force modes. |
| **Skills** | ingest, ingest-force, create-ontology, update-docs (+ create-hook); playbooks and rules aligned. |
| **Docs** | README + SETUP describe pipeline, folders, workflow, restore playbook; plans/ has implementation plans and dev notes; docs/ has reflections and design docs. |

So: the “brief” is met — offline caching, rich ingestion (PDF/docx/audio/media), normalized sources, ontology-driven transform. This is a coherent v1.

---

## 4. Ontology and references

- **Weighting references:** Unlike ingest (documents > chats > transcripts), we are **not** layering a similar weight system on `src/references/` for ontology. Letting the LLM use everything keeps the door open for e.g. “monologue out an idea” as a transcript.
- **Model guidance:** It’s worth stating explicitly (e.g. in create-ontology skill or SETUP): **use a high-reasoning model** when developing the ontology. The system stays agnostic on which one; that can be a separate research/opinion doc later.

---

## 5. Positioning: “marketplace” and non-technical users

- **What Kanon is in the landscape:** A **Cursor-native, repo-centric** knowledge template. Not a no-code abstraction (Lovable, GitHub Codex-style “vibe coding” that hides the stack). The user works in **real** artifacts: Markdown in `src/sources/`, ontology in a rule file, content in `content/`. They use Cursor, Git, and a normal Next/Fumadocs app.
- **The “bait and switch”:** The unstated goal fits: get people comfortable **editing Markdown in Cursor**, then they’re one step away from touching Fumadocs layout, then MDX, then custom components (React). They’re learning “vibe coding” but in **real tools** — Cursor, Git, a real codebase — not in a walled abstraction. So the next step after “I edit sources and run skills” can naturally become “I tweak a component” or “I add a section to the ontology” and then “I add a React component.” That’s a strength to lean into when describing the project.

---

## 6. What this could become (forward-facing intelligence)

If the actual pain is “people are doing context engineering badly in web GUIs,” then the repo template is only half the product. The other half is **a pathway** that gets non-technical users from “chatting” to “operating a durable context system.”

### 6.1 Kanon as a context-engineering starter kit (not just a repo)

What to add over time (without turning it into a SaaS):

- **A facilitation script**: a 60–90 minute “Ontology First” workshop with prompts and examples (capture nouns/verbs, draft entity/event types, define doc sections, define provenance rules).
- **Starter ontology packs** (small and opinionated):
  - “Strategy / consulting” (GPS, decisions, risks, experiments)
  - “Product discovery / delivery” (customers, problems, bets, outcomes)
  - “Research synthesis” (papers, claims, evidence, open questions)
  - “TTRPG campaign” (NPCs, factions, locations, sessions, threads)
- **Example reference packs**: concrete examples of what belongs in `src/references/` for each pack (so users aren’t guessing what “references” means).

### 6.2 Kanon as a “method compiler” (consulting angle)

For consultants/facilitators, the ontology becomes the method. If you can repeatedly map client sources → outputs, you effectively have a “compiler” from messy reality into structured deliverables.

That points at a very clear value proposition: **consistent deliverables, less copy/paste, more continuity**.

### 6.3 Kanon as offline knowledge infrastructure (local-first angle)

The offline-first work isn’t cosmetic—it’s a reliability statement. “Local-first” thinking frames it well: the availability of another computer (or the internet) shouldn’t prevent you from working. Kanon’s Markdown + Git approach also makes long-term preservation and portability unusually strong for AI workflows.

### 6.4 Kanon as a specialization engine (verticals)

Your Invisible Sun example is a great litmus test: if a domain already has a reference corpus that implies an ontology, Kanon can become the “specialization engine” that turns that into:

- entity directories
- timelines
- narratives
- a browsable site (and offline cache)

The repo doesn’t need to “win UX” against vertical products in v1; it needs to make specialization **cheap** and **inspectable**.

---

## 7. Gaps and next steps

### 7.1 Getting started / first-run experience

- **README** is accurate but workflow-heavy. A **Getting started** section (or separate GETTING-STARTED.md) could:
  1. **Ontology first:** “Before you ingest anything, define your ontology (or run create-ontology with references).”
  2. **Then ingest:** Add files to `src/ingest/`, run ingest.
  3. **Then docs:** Run update-docs; run the site.
- Optionally: “What are good references?” — short guidelines (e.g. formal docs vs transcripts; we don’t weight them, but you can describe how you use them).

### 7.2 README review

- Consider one short line on **why ontology first**: e.g. “Your ontology defines what your knowledge base *is*; ingest fills it.”
- Link to GETTING-STARTED from README if we add it.

### 7.3 Model guidance for ontology

- In **create-ontology** skill or SETUP: add a note that ontology design benefits from a **high-reasoning model**; the template doesn’t prescribe which one.
- Optional follow-up: a short doc or memory entry on “recommended models for create-ontology” when we have experience or research.

### 7.4 Optional future directions (not blocking v1)

- **Reference weighting:** Leave as-is; no thumb on the scale for references.
- **Starter ontology:** The embedded example in `.cursor/rules/ontology.mdc` is already a good default; no need to over-engineer.
- **“Good ontology” guidance:** Keep it in human/LLM territory; at most a “tips” subsection in SETUP or a reference doc, not system-enforced.

---

## 8. Summary

- **Intentionality:** ELT pipeline, ontology as contract, offline-first, sources as cleaned (not processed) truth. Clear.
- **v1 state:** Pipeline, media, offline, hooks, skills, and docs are aligned and usable. This is a solid beta / v1 template.
- **Positioning:** Cursor + Git + real repo and real artifacts; a path from Markdown → MDX → React without leaving “real” tools. That’s the differentiator.
- **Next:** (1) Getting started flow (ontology first, then ingest, then docs); (2) explicit “use a high-reasoning model” for ontology; (3) optional README tweaks to reinforce ontology-first and Kanon (K) spelling. Then ship v1 and iterate from real usage.

---

## 9. External references that support the framing

- **Context engineering vs prompt engineering (Jan 2026, Elastic)**: `https://www.elastic.co/search-labs/blog/context-engineering-vs-prompt-engineering`
- **Local-first software paper (Kleppmann et al., Onward! 2019)**: `https://martin.kleppmann.com/2019/10/23/local-first-at-onward.html` (paper link on page)
- **Archivist AI (TTRPG campaign knowledge base workflow)**: `https://www.rpgarchivist.io/how-it-works`
