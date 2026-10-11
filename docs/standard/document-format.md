---
schema: eddy-kb/document/v1
doc:
  id: 3d8a7f54-bb14-4e03-a1d5-9c4f3a6b7d8e
  title: Document format
  kind: derivative
  status: draft
---

# Document format

Markdown is the working format. Frontmatter is optional in the pilot.

```yaml
---
schema: eddy-kb/document/v1
doc:
  id: 59e71e48-76c1-4c01-aab3-1d39a4fe8e64
  title: Release process
  kind: derivative
  status: draft
vars:
  release_channel: stable
---
```

- `doc` carries identity and editorial state. `vars` carries typed domain
  data. Neither is a security authority.
- A document without `doc.id` gets a path-based identity and is reported as
  `unstable_identity`.
- Duplicate `doc.id` values in a source are rejected.
- Variables are data. They are not evaluated as JavaScript, shell, or MDX.
- The durable URI is `kanon://<source-id>/<doc-id-or-path>`.

## Ingested documents

Files written by an ingest job carry their provenance:

```yaml
---
schema: eddy-kb/document/v1
doc:
  id: 336dc6b0-4381-5acf-a3f2-637d6de61d2d
  title: Leave policy
  kind: source
  sources:
    - uri: gdrive://1AbCdEfGhIjKlMnOp
      revision: "42"
      relation: exported-from
---
```

- `doc.id` is a UUID v5 of the source id and the upstream URI, so a rename
  upstream is a rename in Git, not a new document.
- `revision` is the upstream version. An unchanged revision is not read
  again.
- A file whose `doc.sources[].uri` uses the connector's scheme (`gdrive://`)
  belongs to that job. Only those files are updated or deleted; anything
  else under the target is left alone.
- Upstream `vars` are kept. Upstream `doc` fields are replaced.
- Images are moved to `_assets/<sha256>.<ext>` under the target, or
  stripped, depending on the job's `images` setting.
