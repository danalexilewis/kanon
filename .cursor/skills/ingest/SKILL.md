# Ingest Skill

This skill processes raw files from the `src/ingest/` directory, normalizes them into Markdown files with frontmatter under `src/sources/`, extracts or copies media to `public/media/`, and updates the `src/ingest/manifest.json` and `src/ingest/manifest.md` files.

## Inputs

- Files under `src/ingest/` (any format).
- `src/ingest/manifest.json` (to check processing status and avoid re-processing already ingested files).
- `src/sources/corrections.md` (for normalization rules during ingestion).

## Outputs

- Markdown files in `src/sources/documents/`, `src/sources/chats/`, or `src/sources/transcripts/` with standardized frontmatter.
- Binary media in `public/media/YYYY-MM-DD_short_descriptive_name/`, each folder with a **`meta.json`** (required) and optionally `meta.md`.
- Updated `src/ingest/manifest.json` and `src/ingest/manifest.md` (use paths relative to repo root, e.g. `src/ingest/...`, `src/sources/...`, `public/media/...`).

## Key Behaviors

- **Idempotency**: If an ingest file has already been processed (based on hash in `src/ingest/manifest.json`), this skill will skip it unless `ingest-force` is used. When updating an existing source, it will merge changes while preserving protected sections.
- **Overwrite Policy**: New ingest content will update existing source content. User-authored blocks in `src/sources/**` (e.g., within specific `<!-- AGENT_PROTECTED_START -->` / `<!-- AGENT_PROTECTED_END -->` markers) will *not* be overwritten.
- **Provenance**: Each generated source file will include `ingest_paths` and `ingest_hashes` in its frontmatter to trace back to original ingest files (paths under `src/ingest/`).
- **Normalization**: Applies rules from `src/sources/corrections.md` during text normalization (e.g., consistent spellings, entity names).

## Media URL handling

- When processing ingest content, **detect URLs that point to image, audio, or video assets** (e.g., common extensions or paths).
- For **image or audio URLs**: **download the asset** and place it in a new subfolder under `public/media/` named `YYYY-MM-DD_short_descriptive_name/` (use a slug derived from the URL or context; ensure uniqueness).
- In that folder: save the binary file with a clear filename (e.g., `image.png`, `audio.mp3`) and create **`meta.json`** with at least: `source_url` (original URL), `description` (brief), `origin`/`provenance` (e.g., ingest file path). Add other fields as in the media rule.
- For **video URLs (external)**: Do **NOT** download the video. Keep the original URL as-is.
- In the **produced source** Markdown: **reference the media as a link** using the repo-root path (e.g., `[description](public/media/YYYY-MM-DD_short_descriptive_name/asset.jpg)` for images/audio, or `[description](https://external.video/url)` for videos) or inline media syntax where it fits the narrative. Populate frontmatter `media_refs` with the list of `public/media/...` paths (for downloaded media) or external URLs (for videos) used in that source.
- All ingested media (whether from URLs or from attached files) must end up in `public/media/` (if downloaded) or be referenced (if external video URL) and be linked from the source body and/or `media_refs`.
