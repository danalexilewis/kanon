# Setup — Forking and customizing the template

For the main workflow, see [README.md](README.md). For v1 decisions, see [milestone v1 reflection](.cursor/plans/milestone-v1-reflection_2026-02-22.plan.md).

---

## Customizing the ontology and content

- **Ontology schema** — `.cursor/rules/ontology.mdc`. Run `create-ontology` with `src/references/` and your prompt. Use a high-reasoning model.
- **`src/sources/` layout** — `documents/`, `chats/`, `transcripts/` with standardized frontmatter per `sources.mdc`.
- **`public/media/`** — `YYYY-MM-DD_short_descriptive_name/` subfolders with `meta.json` (required) and optional `meta.md`.
- **`content/` layout** — Dictated by ontology and `content/meta.json`.
- **Glossary** — Optional `src/ontology/glossary.md`.
- **Corrections** — `src/sources/corrections.md` (ingest → sources) and `.cursor/corrections.md` (sources → docs).

---

## Cursor rules (reference)

Glob-scoped or agent-requested — no always-apply rules. Full list in README; key rules: `folder-contract`, `ingest`, `sources`, `ontology`, `update-docs`, `media`, `plans`, `fumadocs-reference`, corrections rules.

---

## Stack and build

- **Next.js** 16, **React** 19, **Fumadocs** 16, **Tailwind** v4
- **Twoslash** for TypeScript code blocks in MDX
- **Serwist** for PWA / offline — production build uses Webpack (`next build --webpack`)
- **Husky** pre-commit — Prettier on staged `.md`/`.mdx`, then `validate-links`

### Fumadocs v16 import paths

- Root provider: `fumadocs-ui/provider/next`
- Docs layout: `fumadocs-ui/layouts/docs`

### TypeScript note

Exclude `app/sw.ts` from `tsconfig.json` — its webworker lib breaks `window` in client components.

### Chat to Docs (optional)

The docs UI includes an AI chat panel powered by [OpenRouter](https://openrouter.ai/). Copy `.env.example` to `.env.local` and set:

| Variable             | Required | Purpose                                            |
| -------------------- | -------- | -------------------------------------------------- |
| `OPENROUTER_API_KEY` | Yes      | API key for chat and context export                |
| `OPENROUTER_MODEL`   | No       | Model slug (default: `google/gemma-4-31b-it:free`) |

Without `OPENROUTER_API_KEY`, the chat API returns 503 and the panel still opens but cannot send messages.

---

## Plans

Implementation plans live in **`.cursor/plans/`**. Use the `plan` skill to create or update them.
