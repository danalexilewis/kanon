# Kanon — Agent Instructions

Kanon is a **knowledge system template**, not a code project. It turns raw material into a published knowledge base through a Cursor-driven pipeline. **Data flow:** ingest → sources → docs (shaped by ontology). **Skill run order:** create-ontology → ingest → update-docs. The output is a Fumadocs site (Next.js 16 + React 19).

For content corrections when writing to `content/`, see `.cursor/corrections.md`. For ingest normalization, see `src/sources/corrections.md`.

## The pipeline

Stages (data flow):

1. **Ingest** — Raw material drops into `src/ingest/` (append-only). The `ingest` skill normalizes it into `src/sources/`.
2. **Sources** — Canonical Markdown in `src/sources/`. This is the source of truth; if `content/` disagrees, sources win.
3. **Ontology** — Schema defined in `.cursor/rules/ontology.mdc`. Built with `create-ontology` from `src/references/`.
4. **Docs** — `update-docs` generates `content/` (Fumadocs MDX). Do not hand-edit `content/` when it disagrees with sources.

Skills: `create-ontology`, `ingest`, `update-docs`. Run in that order — define ontology before ingesting.

## Key folders

| Path                | Purpose                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `src/ingest/`       | Raw material (append-only, hook-protected)                                 |
| `src/sources/`      | Canonical Markdown sources                                                 |
| `src/references/`   | Reference material for ontology                                            |
| `src/ontology/`     | Optional glossary                                                          |
| `content/`          | Derived Fumadocs output (generated, not hand-edited)                       |
| `public/media/`     | Media library (`YYYY-MM-DD_slug/` with `meta.json`)                        |
| `app/`              | Next.js + Fumadocs app                                                     |
| `app/dev/ontology/` | Dev-only ontology tool (`/dev/ontology`) — schema graph, coverage, sources |
| `lib/`              | Source loader, utilities                                                   |
| `lib/dev/`          | Ontology parser and types used by the dev tool                             |
| `.cursor/`          | Rules, skills, hooks, plans                                                |

## Working conventions

- **Rules** load via glob or agent-request — no always-apply rules. See `.cursor/rules/`.
- **Ontology dev tool** — `/dev/ontology` graph, parser, inspector. Glob rule: `.cursor/rules/ontology-dev-tool.mdc`. Deep doc: `app/dev/ontology/GRAPH-ROUTING.md`.
- **Skills** use three-tier loading: metadata → `SKILL.md` → `references/` on demand. See `.cursor/skills/`.
- **Plans** live in `.cursor/plans/`. Use the `plan` skill to create or update them.
- **Hooks** in `.cursor/hooks/` enforce pipeline safety (ingest revert, pipeline reminders). Formatting runs via Husky pre-commit, not Cursor hooks.
- **Corrections** — two stores: `src/sources/corrections.md` (ingest normalization) and `.cursor/corrections.md` (content generation).
- **Media** — images/audio downloaded to `public/media/`; video URLs stay as-is. Sources use repo-root links; `content/` uses `/media/...` web paths.
- Validate TypeScript with `pnpm exec tsc --noEmit` after changing code.
- `pnpm run dev` uses Turbopack; `pnpm run build` uses Webpack (Serwist compat).

## Git Safety Protocol

- Only commit when the user explicitly asks.
- Never update git config or force-push.
- Pass commit messages via HEREDOC.
- Workflow: `git add` → `git commit` → `git status`.

## Learned User Preferences

- When asked to create or add hooks, add the script under `.cursor/hooks/` and register it in `.cursor/hooks.json`. Use Node scripts reading JSON from stdin, `workspace_roots` for repo root.
- Ingest is protected by `.cursor/hooks/revert-ingest-if-edited.js` — no protection modes (safe/normal/force) and no user-run scripts.

## Learned Workspace Facts

- Image and audio URLs in ingest content are downloaded to `public/media/YYYY-MM-DD_slug/` with `meta.json`; video URLs stay as-is. Sources use repo-root links; `content/` uses `/media/...` web paths with ImageZoom, AudioPlayer, and VideoPlayer.
- Exclude `app/sw.ts` from `tsconfig.json` `exclude` — its webworker lib breaks `window` in client components. The SW is built by esbuild (Serwist), not the main TS build.
- Prefer `useSyncExternalStore` for `navigator.onLine` in client components (SSR-safe).
- Use `Glob` to enumerate directories when a list-directory view is needed.

## Dev tools (index)

| Tool                  | Route           | Agent entry                                                                 |
| --------------------- | --------------- | --------------------------------------------------------------------------- |
| **Ontology dev tool** | `/dev/ontology` | `.cursor/rules/ontology-dev-tool.mdc` → `app/dev/ontology/GRAPH-ROUTING.md` |

**Ontology graph layers** (read GRAPH-ROUTING before changing): dagre layout → partner-aligned handles → libavoid routing → transit clearance (nudge obstacle nodes when unrelated edges clip them). Handles are node-level pins, not property rows. Cardinality icons live on edges only (`CardinalityEdge.tsx`).
