---
schema: eddy-kb/document/v1
doc:
  id: 60bd0287-ee47-4136-d408-2f7c6d9e0a1b
  title: Search and get
  kind: derivative
  status: draft
---

# Search and get

```bash
pnpm kanon search "release process" --index team --mode lexical
pnpm kanon get 'kanon://<source-id>/<doc-id>' --index team
pnpm kanon status
```

Results include a `kanon://` URI, git commit, content hash, index
generation, the mode actually used, and line references. `get` checks
scope again and compares the live file hash to the indexed hash.

Unknown or ungranted index names both return `index_not_available`.
