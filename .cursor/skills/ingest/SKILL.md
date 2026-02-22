# Ingest Skill

This skill processes raw files from the `src/ingest/` directory, normalizes them into Markdown files with frontmatter under `src/sources/`, extracts or copies media to `src/media/`, and updates the `src/ingest/manifest.json` and `src/ingest/manifest.md` files.

## Inputs

- Files under `src/ingest/` (any format).
- `src/ingest/manifest.json` (to check processing status and avoid re-processing already ingested files).
- `src/sources/corrections.md` (for normalization rules during ingestion).

## Outputs

- Markdown files in `src/sources/documents/`, `src/sources/chats/`, `src/sources/transcripts/`, or `src/sources/media/` with standardized frontmatter.
- Binary media in `src/media/YYYY-MM-DD_short_descriptive_name/`, each folder with a **`meta.json`** (required) and optionally `meta.md`.
- Updated `src/ingest/manifest.json` and `src/ingest/manifest.md` (use paths relative to repo root, e.g. `src/ingest/...`, `src/sources/...`).

## Key Behaviors

- **Idempotency**: If an ingest file has already been processed (based on hash in `src/ingest/manifest.json`), this skill will skip it unless `ingest-force` is used. When updating an existing source, it will merge changes while preserving protected sections.
- **Overwrite Policy**: New ingest content will update existing source content. User-authored blocks in `src/sources/**` (e.g., within specific `<!-- AGENT_PROTECTED_START -->` / `<!-- AGENT_PROTECTED_END -->` markers) will *not* be overwritten.
- **Provenance**: Each generated source file will include `ingest_paths` and `ingest_hashes` in its frontmatter to trace back to original ingest files (paths under `src/ingest/`).
- **Normalization**: Applies rules from `src/sources/corrections.md` during text normalization (e.g., consistent spellings, entity names).

## Image URL handling

- When processing ingest content, **detect URLs that point to image assets** (e.g. `https://.../image.png`, common image extensions or image-like paths).
- For each such URL: **download the image** and place it in a new subfolder under `src/media/` named `YYYY-MM-DD_short_descriptive_name/` (use a slug derived from the URL or context; ensure uniqueness).
- In that folder: save the binary file with a clear filename (e.g. `image.png` or `screenshot.jpg`) and create **`meta.json`** with at least: `source_url` (original URL), `description` (brief), `origin`/`provenance` (e.g. ingest file path). Add other fields as in the media rule.
- In the **produced source** Markdown: **reference the media as a link** using the repo-root path, e.g. `[description](src/media/YYYY-MM-DD_short_descriptive_name/asset.jpg)` or inline image syntax `![description](src/media/.../asset.jpg)` where it fits the narrative. Populate frontmatter `media_refs` with the list of `src/media/...` paths used in that source.
- All ingested media (whether from URLs or from attached files) must end up in `src/media/` and be linked from the source body and/or `media_refs`.
