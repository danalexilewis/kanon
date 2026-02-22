# Ingest manifest

This file records which ingest files have been processed into the Fumadocs content folder (`content/`). The agent updates this file when it processes an ingest file; all other files under `ingest/` are **read-only**. This Markdown file is automatically generated from `ingest/manifest.json` for human readability.

| File | Processed | Date / Session |
|------|-----------|----------------|
| *(none yet)* | — | — |

---

- **Processed** = content has been written or updated under `content/` and provenance recorded.
- **Re-processing** the same file must update existing content under `content/` (idempotent); do not create duplicate entities.
