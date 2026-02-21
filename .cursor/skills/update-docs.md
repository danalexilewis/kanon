# Update Docs Skill (skills/update-docs.md)

This skill reads the canonical source Markdown files from `sources/` and the ontology definition from `ontology/ontology.md`, then generates or updates the derived Fumadocs content files under `content/`. It also ensures `content/meta.json` (and subfolder `meta.json` files) are valid for navigation.

## Inputs
- Markdown files from `sources/documents/`, `sources/chats/`, `sources/transcripts/`, `sources/media/`.
- `ontology/ontology.md` (defines how content should be structured and populated in `content/`).
- `content/manifest.json` (optional, to track which sources have been applied).
- Existing files under `content/` (to update incrementally).

## Outputs
- Markdown (or MDX) files in `content/docs/`, `content/entities/`, `content/events/`, and any new sections defined by the ontology.
- Updated `content/meta.json` and `content/**/meta.json` files for Fumadocs navigation.
- If selected, mirrors `media/` into `public/media/` to make assets available on the website.

## Key Behaviors
- **Idempotency**: Re-running this skill will update existing `content/` files based on current `sources/` and `ontology/` definitions; it will not create duplicate content.
- **Overwrite Policy**: Derived sections in `content/**` are fully managed and will be overwritten. User-authored sections (e.g., within `<!-- AGENT_PROTECTED_START -->` / `<!-- AGENT_PROTECTED_END -->` markers) will be preserved.
- **Provenance**: `content/**` files will include frontmatter or a section linking back to the `sources/` IDs from which they were derived.
- **Ontology Adherence**: Ensures that the generated content under `content/` strictly follows the structure, naming conventions, and relationships defined in `ontology/ontology.md`.
- **Media Handling (Option A - Recommended)**: Copies relevant `media/` assets to `public/media/` during the update process to ensure they are available for the Next.js/Fumadocs application.
