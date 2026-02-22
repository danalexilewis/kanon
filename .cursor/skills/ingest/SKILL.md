# Ingest Skill

This skill processes raw files from the `ingest/` directory, normalizes them into Markdown files with frontmatter under `sources/`, extracts or copies media to `media/`, and updates the `ingest/manifest.json` and `ingest/manifest.md` files.

## Inputs

- Files under `ingest/` (any format).
- `ingest/manifest.json` (to check processing status and avoid re-processing already ingested files).
- `sources/corrections.md` (for normalization rules during ingestion).

## Outputs

- Markdown files in `sources/documents/`, `sources/chats/`, `sources/transcripts/`, or `sources/media/` with standardized frontmatter.
- Binary media files and their corresponding `meta.md` files in `media/YYYY-MM-DD_short_descriptive_name/`.
- Updated `ingest/manifest.json` and `ingest/manifest.md`.

## Key Behaviors

- **Idempotency**: If an ingest file has already been processed (based on hash in `ingest/manifest.json`), this skill will skip it unless `ingest-force` is used. When updating an existing source, it will merge changes while preserving protected sections.
- **Overwrite Policy**: New ingest content will update existing source content. User-authored blocks in `sources/**` (e.g., within specific `<!-- AGENT_PROTECTED_START -->` / `<!-- AGENT_PROTECTED_END -->` markers) will *not* be overwritten.
- **Provenance**: Each generated source file will include `ingest_paths` and `ingest_hashes` in its frontmatter to trace back to original ingest files.
- **Normalization**: Applies rules from `sources/corrections.md` during text normalization (e.g., consistent spellings, entity names).
