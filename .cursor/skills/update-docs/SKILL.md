# Update Docs Skill

This skill reads the canonical source Markdown files from `src/sources/` and the **ontology schema** from **`.cursor/rules/ontology.mdc`**, then generates or updates the derived Fumadocs content files under `content/`. It also ensures `content/meta.json` (and subfolder `meta.json` files) are valid for navigation.

## Inputs

- Markdown files from `src/sources/documents/`, `src/sources/chats/`, `src/sources/transcripts/`, `src/sources/media/`.
- Ontology schema in `.cursor/rules/ontology.mdc` (defines how content should be structured and populated in `content/`).
- Media assets in `src/media/` (referenced by sources via repo-root paths).
- `content/manifest.json` (optional, to track which sources have been applied; use keys like `src/sources/...`).
- Existing files under `content/` (to update incrementally).

## Outputs

- Markdown (or MDX) files in `content/docs/`, `content/entities/`, `content/events/`, and any new sections defined by the ontology.
- Updated `content/meta.json` and `content/**/meta.json` files for Fumadocs navigation.
- **Mirror** of `src/media/` into `public/media/` so assets are served at `/media/...`.

## Key Behaviors

- **Idempotency**: Re-running this skill will update existing `content/` files based on current `src/sources/` and the ontology rule; it will not create duplicate content.
- **Overwrite Policy**: Derived sections in `content/**` are fully managed and will be overwritten. User-authored sections (e.g., within `<!-- AGENT_PROTECTED_START -->` / `<!-- AGENT_PROTECTED_END -->` markers) will be preserved.
- **Provenance**: `content/**` files will include frontmatter or a section linking back to the `src/sources/` IDs from which they were derived.
- **Ontology Adherence**: Ensures that the generated content under `content/` strictly follows the structure, naming conventions, and relationships defined in `.cursor/rules/ontology.mdc`.
- **Media mirroring**: Copy (mirror) `src/media/` to `public/media/` so the site can serve assets at `/media/...`. Do this as part of every update-docs run.
- **Embedding images in content**: When generating or updating `content/` pages from `src/sources/`:
  - Resolve media references (frontmatter `media_refs` and any `src/media/...` links in the source body) to **web paths**: `/media/YYYY-MM-DD_short_descriptive_name/asset.jpg` (same relative path under `public/media/`).
  - **Embed images** in the generated MDX using standard Markdown image syntax, e.g. `![alt text](/media/YYYY-MM-DD_short_descriptive_name/asset.jpg)`, so Fumadocs (and the ImageZoom component) can render them.
  - **Placement**: Place each image **after** the block of text it is associated with, so the page reads naturally (text first, then the related image). Format the layout so images are clearly tied to the preceding content (e.g. a short caption or proximity to the relevant paragraph).
