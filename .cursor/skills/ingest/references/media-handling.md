# Media URL Handling (Ingest)

When processing ingest content, detect URLs that point to image, audio, or video assets.

## Image or audio URLs

- **Download** the asset and place it in `public/media/YYYY-MM-DD_short_descriptive_name/` (slug from URL or context; ensure uniqueness).
- Save the binary with a clear filename (e.g. `image.png`, `audio.mp3`).
- Create **`meta.json`** with at least: `source_url`, `description`, `origin`/`provenance` (e.g. ingest file path). See `.cursor/rules/media.mdc` for full field list.

## Video URLs (external)

- Do **NOT** download. Keep the original URL as-is.

## Source references

In produced source Markdown:

- Downloaded media: repo-root path, e.g. `[description](public/media/YYYY-MM-DD_slug/asset.jpg)`
- External video: keep URL, e.g. `[description](https://external.video/url)`
- Populate frontmatter `media_refs` with `public/media/...` paths (downloaded) or external URLs (videos).

All ingested media must end up in `public/media/` (if downloaded) or be referenced (external video) and linked from the source body and/or `media_refs`.
