# Kanon — Agent instructions

Kanon is a **local-first knowledge tool**, not a website and not an editor
plugin. Repositories become sources. QMD builds physically separate indexes.
A never-rest contract exposes search and get. An optional MCP server opens
only the indexes a project is granted.

These notes describe the current tree. They are not a spec.

## Question → doc

| Question | Where |
| --- | --- |
| What is Kanon now? | [README.md](README.md) · [docs/index.md](docs/index.md) |
| How do the pieces fit? | [docs/architecture.md](docs/architecture.md) |
| What is trusted, and what is not? | [docs/threat-model.md](docs/threat-model.md) |
| Source repo layout and `kanon.yml` | [docs/standard/source-manifest.md](docs/standard/source-manifest.md) |
| Document frontmatter | [docs/standard/document-format.md](docs/standard/document-format.md) |
| Machine config, indexes, grants | [docs/standard/machine-config.md](docs/standard/machine-config.md) |
| How do I add a source? | [docs/guides/add-a-source.md](docs/guides/add-a-source.md) |
| How do I search? | [docs/guides/search.md](docs/guides/search.md) |
| How do agents connect? | [docs/guides/mcp.md](docs/guides/mcp.md) |
| How do scheduled refresh and ingest work? | [docs/guides/scheduled-jobs.md](docs/guides/scheduled-jobs.md) |
| How do circles of trust work? | [docs/guides/circles-of-trust.md](docs/guides/circles-of-trust.md) |
| How do I connect Google Drive? | [docs/guides/google-drive.md](docs/guides/google-drive.md) |
| How do jobs run across devices? | [docs/guides/multiple-devices.md](docs/guides/multiple-devices.md) |
| Why rewrite in place? | [docs/decisions/0001-rewrite-in-place.md](docs/decisions/0001-rewrite-in-place.md) |
| Why pin QMD 2.8.3? | [docs/decisions/0002-pinned-qmd-sdk.md](docs/decisions/0002-pinned-qmd-sdk.md) |
| Why is an index the unit of access? | [docs/decisions/0003-index-is-unit-of-access.md](docs/decisions/0003-index-is-unit-of-access.md) |
| What does a project ID prove? | [docs/decisions/0004-local-project-identity.md](docs/decisions/0004-local-project-identity.md) |
| Why do connectors write Markdown to Git? | [docs/decisions/0006-connectors-land-as-markdown-in-git.md](docs/decisions/0006-connectors-land-as-markdown-in-git.md) |
| How is write access checked? | [docs/decisions/0007-write-access-is-probed.md](docs/decisions/0007-write-access-is-probed.md) |
| Why circles of trust? | [docs/decisions/0008-circles-of-trust.md](docs/decisions/0008-circles-of-trust.md) |
| Why check the audience before push? | [docs/decisions/0009-circle-audience-checked-before-push.md](docs/decisions/0009-circle-audience-checked-before-push.md) |
| How do levels and review work? | [docs/decisions/0010-sensitivity-levels-and-review.md](docs/decisions/0010-sensitivity-levels-and-review.md) |
| Current implementation plan | [plans/20261011-kanon-v2-local-first.md](plans/20261011-kanon-v2-local-first.md) |
| Scheduled sync and connectors plan | [plans/20261011-scheduled-sync-and-connectors.md](plans/20261011-scheduled-sync-and-connectors.md) |
| Circles of trust plan | [plans/20261011-circles-of-trust.md](plans/20261011-circles-of-trust.md) |
| Source review | [docs/background/never-rest-local-knowledge-review-2026-10-11.md](docs/background/never-rest-local-knowledge-review-2026-10-11.md) |

## Coding conventions

- Functional TypeScript. Named functions. No classes.
- Handlers return `neverthrow` Results. Zod schemas are strict.
- Domain code does not import an agent SDK, editor API, or UI framework.
- Tests run under `test/setup.ts`, which points `KANON_HOME`,
  `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, and `QMD_CONFIG_DIR` at a temp dir.
  Never touch the operator's real `~/.config/qmd`.
- After changing docs or plans, run `pnpm docs:index`.

## Docs index

```bash
pnpm docs:index
pnpm docs:search "index access"
pnpm docs:get kanon-docs/decisions/0003-index-is-unit-of-access.md
```

Lexical by default. Pass `--hybrid` to `docs:search` only when models are
available.

## Skill run order (obsolete)

v1 skills (`create-ontology`, `ingest`, `update-docs`) are gone. Do not look
for `src/ingest/` or `content/`.
