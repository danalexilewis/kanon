---
schema: eddy-kb/document/v1
doc:
  id: 71ce1398-ff58-4247-e519-3a8d7e0f1b2c
  title: MCP access
  kind: derivative
  status: draft
---

# MCP access

Agents call the same operations as the CLI. The process is scoped to a
project:

```bash
pnpm kanon mcp-config my-app
pnpm kanon mcp --project my-app
```

`mcp-config` prints a generic stdio snippet. Do not write runtime-specific
config into a source repository.

The server opens only granted index files. A project id is a declared
identity, not isolation from a hostile process on the same OS account.
See [the threat model](../threat-model.md).
