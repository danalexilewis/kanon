---
schema: eddy-kb/document/v1
doc:
  id: 2c7f6e43-aa03-4d92-90c4-8b3e2f5a6c7d
  title: Source manifest
  kind: derivative
  status: draft
---

# Source manifest

A source repository (or local directory) declares itself with `kanon.yml`
at its root. Schema `kanon/source/v1`.

```yaml
schema: kanon/source/v1
id: 93ebd59e-d353-4c6b-9b35-6724937abf40
name: Team docs
roots:
  - path: docs
    pattern: '**/*.md'
    context: Team documentation
exclude:
  - history/**
```

## Rules

- `id` is a UUID. Human `name` is a convenience.
- `roots[].path` is relative to the repository root. After resolve, it must
  stay inside the repository. Symlinks that escape are rejected.
- There are no fields for hooks, commands, remotes, or executables. Extra
  keys fail validation.
- A repository cannot grant itself filesystem roots or index access. That
  lives in machine config on the operator's machine.
