# Ingest Force Skill

This skill re-processes all raw files from the `ingest/` directory, regardless of their current status in `ingest/manifest.json`. It performs the same normalization, media extraction/copying, and manifest updates as the `ingest` skill.

## Inputs

- All files under `ingest/` (any format).
- `sources/corrections.md` (for normalization rules during ingestion).

## Outputs

- Updated or newly created Markdown files in `sources/documents/`, `sources/chats/`, `sources/transcripts/`, or `sources/media/`.
- Updated binary media files and their corresponding `meta.md` files in `media/YYYY-MM-DD_short_descriptive_name/`.
- Updated `ingest/manifest.json` and `ingest/manifest.md`.

## Key Behaviors

- **Force Re-ingestion**: Ignores the `ingested` status in `ingest/manifest.json` and processes all files.
- **Idempotency**: When re-ingesting, it identifies existing source files by their `id` (or other stable identifier) and updates them rather than creating duplicates.
- **Overwrite Policy**: Similar to the `ingest` skill, it will update existing source content but *preserve* user-authored blocks within protected markers.
- **Provenance**: Ensures `ingest_paths` and `ingest_hashes` are correctly updated in source frontmatter.
- **Normalization**: Applies rules from `sources/corrections.md` during text normalization.
