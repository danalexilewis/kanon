---
schema: eddy-kb/document/v1
doc:
  id: 82df2409-0069-4358-f62a-4b9e8f102c3d
  title: Pilot checks
  kind: derivative
  status: draft
---

# Pilot checks

The CLI does not require an agent:

```bash
pnpm kanon --help
pnpm test
```

After models are present, `pnpm kanon search … --mode hybrid` still works
offline for lexical if you pass `--mode lexical`.

Rebuild:

```bash
rm -rf "$KANON_CACHE/indexes"
pnpm kanon index update
```

Two agent runtimes: run `pnpm kanon mcp-config <project>` and point each
runtime at the same stdio command. They should see the same granted index.
