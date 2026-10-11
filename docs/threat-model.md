---
schema: eddy-kb/document/v1
doc:
  id: 1b8e5d32-99e2-4c81-8f3b-7a2d1e4f5b6c
  title: Threat model
  kind: derivative
  status: draft
---

# Threat model

This page is the current model, not a certification.

## Assets

- Team-shared Markdown in managed clones.
- Local-only journals.
- QMD indexes (projections of the above).
- Machine config (roots, remotes, grants, connectors, ingest jobs).
- Git credentials used by sync and ingest pushes.
- Connector credentials in `$KANON_HOME/credentials/` (OAuth refresh tokens
  and service-account keys).
- The review ledger (`$KANON_HOME/reviews/`).
- The ingest staging cache (`$KANON_CACHE/jobs/staging/`).
- Scorer API keys in `$KANON_HOME/credentials/`.
- Local circle bare repos and their checkouts.

## Trusted

- The human operator who edits `$KANON_HOME`.
- Application code in this repository.
- A pinned QMD SDK talking to an explicit `dbPath`.

## Untrusted

- Source repository contents, including `kanon.yml`.
- Agent runtimes and their prompts.
- QMD collection names or paths supplied by a caller.
- Frontmatter labels such as `status: approved`.
- The global `~/.config/qmd` file.
- Connector content: file names, folder names, Markdown bodies, embedded
  images and frontmatter coming from Google Drive or any later connector.
- Drive sharing lists. They are a claim, re-checked on every run.
- Model output from a scorer. It cannot admit a document or lower a level.

## Local project identity

`kanon mcp --project <id>` is a **declared** identity checked against
operator grants. It stops accidental cross-project exposure. It does **not**
isolate a hostile agent that already has the operator's OS account, the
config file, and the index files. That needs a real execution boundary
(separate OS user, sandbox, or later HTTP credentials).

## Scheduled jobs

- `kanon.yml` cannot declare connectors, schedules, commands or write
  access. Only machine config can.
- Jobs are operator-only. They are not in the never-rest contract and the MCP
  server does not expose them.
- Git runs with hooks disabled and no stdin. Only `HOME`, `SSH_AUTH_SOCK`,
  `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_NOSYSTEM` pass through, and only for
  network and commit operations. Network calls time out after five minutes.
- Connector file and folder names become slugs; `..`, absolute paths and
  separators cannot escape the job's target. A symlink anywhere under the
  target fails the run.
- Ingested Markdown is validated with the same source scanner as everything
  else before a commit is made. Upstream `doc` fields are replaced, so
  connector content cannot claim another document's id.
- Credentials never enter a repo, `config.yml`, logs or error messages.

## Invariants

- Unknown and ungranted index names return the same `index_not_available`
  error. No titles, snippets, counts, or paths leak.
- A caller cannot widen the corpus by passing another collection, path,
  profile, or document id.
- Sync and refresh never auto-reset, auto-stash, or force-push.
- Ingest pushes only to sources with verified write access, only to the
  configured remote and branch, never with force, and only changes files
  inside the job's target.
- Ingest never modifies the operator's checkout except by fast-forward.
- Tests must not read or write the operator's real QMD config, real
  LaunchAgents or systemd units.
- An ingested document is written only to a circle in the job's route.
  There is no unrouted ingest.
- No addition or update is pushed without a passing audience check for
  that circle. Hosted remotes are unverified until they have a probe.
- The model proposer never lowers a level and never runs from `tick` or
  `ingest run`.

## Remaining risks

- Git history still holds a file after it is removed from a circle.
- Transcripts write down conversations nobody chose to file.
- A cloud model provider sees the bodies sent to it.
- Local circle repos sitting inside a synced or backed-up folder inherit
  that folder's audience.
