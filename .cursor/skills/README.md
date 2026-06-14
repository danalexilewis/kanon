# Cursor Skills

Each skill lives in its own folder with a **`SKILL.md`** file. Detailed reference material lives in **`references/`** subfolders and loads on demand.

| Skill folder           | Purpose                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| **`ingest/`**          | Process raw files from `src/ingest/` into `src/sources/` and `public/media/`; update manifests. |
| **`create-ontology/`** | Build or refine the ontology schema in `.cursor/rules/ontology.mdc`.                            |
| **`update-docs/`**     | Generate/update `content/` from `src/sources/` and the ontology schema.                         |
| **`plan/`**            | Create and update plan documents in `.cursor/plans/`.                                           |
| **`commit/`**          | Group changes into clean, well-described commits.                                               |
| **`assess-risk/`**     | Evaluate code changes or feature proposals using the risk framework.                            |
| **`brief/`**           | Write a decision brief before committing to significant changes.                                |

Entity/event templates for update-docs live in **`update-docs/references/templates/`**.
