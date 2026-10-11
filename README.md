# Kanon

Local-first knowledge indexes. A repository of Markdown is a **source**. QMD
builds an **index**. Projects are granted indexes. Humans use the CLI. Agents
use the same operations through an optional MCP adapter. No named assistant
is required.

This README describes the current tree. It is not a spec.

## Install

```bash
pnpm install
pnpm exec tsc --noEmit
```

Machine config lives in `$KANON_HOME` or `~/.config/kanon`. Indexes live under
the cache dir. Neither is the source of truth — Git-tracked Markdown is.

## Quick start

```bash
pnpm kanon init
pnpm kanon source init ./my-docs
pnpm kanon source add --path ./my-docs --kind local
pnpm kanon index create my-docs --source <source-uuid>
pnpm kanon project add my-app --root .
pnpm kanon grant my-app --index my-docs
pnpm kanon sync
pnpm kanon index update
pnpm kanon search "release process" --index my-docs
```

Agents:

```bash
pnpm kanon mcp-config my-app
pnpm kanon mcp --project my-app
```

Scheduled refresh and ingest (see [docs/guides/scheduled-jobs.md](docs/guides/scheduled-jobs.md)):

```bash
pnpm kanon schedule install
pnpm kanon jobs status
pnpm kanon connector add team-drive --kind google-drive --client-secret client.json
pnpm kanon connector auth team-drive
pnpm kanon circle init me --dir ~/circles --members operator --ceiling 3
pnpm kanon ingest scan policies
pnpm kanon ingest run policies --from-scan --dry-run
```

## Layout

| Path | Purpose |
| --- | --- |
| `src/contracts` | never-rest operation contract |
| `src/core` | identity, URIs, scope, hashes |
| `src/config` | manifests and machine config |
| `src/sources` | Git sync and write probes |
| `src/jobs` | refresh, ingest, tick, OS scheduler |
| `src/circles` | readers, placement |
| `src/hosts` | audience check before push |
| `src/review` | ledger and approvals |
| `src/scoring` | local signals and optional model |
| `src/connectors` | connector interface and Google Drive |
| `src/retrieval` | QMD adapter and index jobs |
| `src/cli` | standalone CLI |
| `src/mcp` | optional MCP process |
| `docs/` | current documentation |
| `plans/` | implementation plans |
| `templates/source/` | `kanon.yml` starter |

v1 (Next/Fumadocs, ingest pipeline, Cursor-only core) is tagged `v1-final`
and kept on `archive/v1`.

## License

MIT — see [LICENSE](LICENSE).
