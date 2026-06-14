---
name: ingest
description: Process raw files from src/ingest/ into src/sources/ and public/media/. Use when new files are added to src/ingest/ or when the user asks to ingest.
paths: src/ingest/**
---

# Ingest Skill

Processes raw files from `src/ingest/`, normalizes them into Markdown under `src/sources/`, extracts media to `public/media/`, and updates ingest manifests.

## Inputs

- Files under `src/ingest/` (any format).
- `src/ingest/manifest.json` (processing status and hashes).
- `src/sources/corrections.md` (normalization rules).

## Outputs

- Markdown in `src/sources/documents/`, `src/sources/chats/`, or `src/sources/transcripts/` with standardized frontmatter.
- Binary media in `public/media/YYYY-MM-DD_short_descriptive_name/` with **`meta.json`** (required) and optionally `meta.md`.
- Updated `src/ingest/manifest.json` and `src/ingest/manifest.md` (paths relative to repo root).

## Key Behaviors

- **Idempotency**: Skip already-processed files (by hash in manifest). When re-processing is requested, update existing sources and media in place. Merge updates while preserving `<!-- AGENT_PROTECTED_START -->` / `<!-- AGENT_PROTECTED_END -->` sections.
- **Provenance**: Include `ingest_paths` and `ingest_hashes` in source frontmatter.
- **Normalization**: Apply `src/sources/corrections.md` before writing to `src/sources/`.

## Media

See [references/media-handling.md](references/media-handling.md) for URL detection, download rules, and source linking.
