# Ingest Force Skill

This skill re-processes all raw files from the `src/ingest/` directory, regardless of their current status in `src/ingest/manifest.json`. It performs the same normalization, media extraction/copying, and manifest updates as the `ingest` skill.

## Inputs

- All files under `src/ingest/` (any format).
- `src/sources/corrections.md` (for normalization rules during ingestion).

## Outputs

- Updated or newly created Markdown files in `src/sources/documents/`, `src/sources/chats/`, `src/sources/transcripts/`, or `src/sources/media/`.
- Updated binary media in `src/media/YYYY-MM-DD_short_descriptive_name/`, each with **`meta.json`** (and optionally `meta.md`). Image URLs encountered in ingest content are downloaded and stored here; sources reference them as repo-root links.
- Updated `src/ingest/manifest.json` and `src/ingest/manifest.md`.

## Key Behaviors

- **Force Re-ingestion**: Ignores the `ingested` status in `src/ingest/manifest.json` and processes all files.
- **Idempotency**: When re-ingesting, it identifies existing source files by their `id` (or other stable identifier) and updates them rather than creating duplicates.
- **Overwrite Policy**: Similar to the `ingest` skill, it will update existing source content but *preserve* user-authored blocks within protected markers.
- **Provenance**: Ensures `ingest_paths` and `ingest_hashes` are correctly updated in source frontmatter.
- **Normalization**: Applies rules from `src/sources/corrections.md` during text normalization.
