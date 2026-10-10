---
schema: eddy-kb/document/v1
doc:
  id: 4e9b8065-cc25-4f14-b2e6-0d5a4b7c8e9f
  title: Machine configuration
  kind: derivative
  status: draft
---

# Machine configuration

Operator-local file: `$KANON_HOME/config.yml` (or
`$XDG_CONFIG_HOME/kanon/config.yml`). Schema `kanon/machine/v1`.

```yaml
schema: kanon/machine/v1
sources:
  - id: 93ebd59e-d353-4c6b-9b35-6724937abf40
    kind: local
    path: /Users/you/repos/team-docs
indexes:
  - id: team
    sources:
      - 93ebd59e-d353-4c6b-9b35-6724937abf40
projects:
  - id: my-app
    root: /Users/you/repos/my-app
grants:
  - project: my-app
    indexes:
      - team
```

- `kind: managed` is a clone Kanon may fast-forward. `kind: local` is
  never fetched. Journals default to local.
- Changing trusted roots and remotes requires the operator (this file).
- Derived QMD files live under the cache directory, not in Git.
