# Ingest Skill

This skill processes raw files from the `src/ingest/` directory, normalizes them into Markdown files with frontmatter under `src/sources/`, extracts or copies media to `src/media/`, and updates the `src/ingest/manifest.json` and `src/ingest/manifest.md` files.

## Inputs

- Files under `src/ingest/` (any format).
- `src/ingest/manifest.json` (to check processing status and avoid re-processing already ingested files).
- `src/sources/corrections.md` (for normalization rules during ingestion).

## Outputs

- Markdown files in `src/sources/documents/`, `src/sources/chats/`, `src/sources/transcripts/`, or `src/sources/media/` with standardized frontmatter.
- Binary media files and their corresponding `meta.md` files in `src/media/YYYY-MM-DD_short_descriptive_name/`.
- Updated `src/ingest/manifest.json` and `src/ingest/manifest.md` (use paths relative to repo root, e.g. `src/ingest/...`, `src/sources/...`).

## Key Behaviors

- **Idempotency**: If an ingest file has already been processed (based on hash in `src/ingest/manifest.json`), this skill will skip it unless `ingest-force` is used. When updating an existing source, it will merge changes while preserving protected sections.
- **Overwrite Policy**: New ingest content will update existing source content. User-authored blocks in `src/sources/**` (e.g., within specific `<!-- AGENT_PROTECTED_START -->` / `<!-- AGENT_PROTECTED_END -->` markers) will *not* be overwritten.
- **Provenance**: Each generated source file will include `ingest_paths` and `ingest_hashes` in its frontmatter to trace back to original ingest files (paths under `src/ingest/`).
- **Normalization**: Applies rules from `src/sources/corrections.md` during text normalization (e.g., consistent spellings, entity names).
