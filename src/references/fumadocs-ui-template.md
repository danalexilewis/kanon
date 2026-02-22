# Fumadocs UI Template (reference)

**Repository:** [fuma-nama/fumadocs-ui-template](https://github.com/fuma-nama/fumadocs-ui-template)

Official Next.js + Fumadocs template from the Fumadocs maintainers. It is under **active maintenance** and should be consulted when planning or implementing docs-site features (layout, search, MDX, content source, navigation, etc.).

## When to use this reference

- Planning new features for the docs site or Fumadocs integration
- Adding or changing: content source, search, layout, MDX config, docs routes
- Aligning with current Fumadocs patterns (e.g. `source.config.ts`, `lib/source.ts`, app structure)

## Key areas in the template

| Area | Purpose |
|------|--------|
| `lib/source.ts` | Content source adapter; `loader()` interface for content access |
| `lib/layout.shared.tsx` | Shared layout options (optional but preferred) |
| `source.config.ts` | Fumadocs MDX config (frontmatter schema, etc.) |
| `app/(home)` | Landing and other non-docs pages |
| `app/docs` | Documentation layout and pages |
| `app/api/search/route.ts` | Route handler for search |
| `mdx-components.tsx` | MDX component overrides |
| `content/docs` | Example docs content and structure |

## Links

- Repo: https://github.com/fuma-nama/fumadocs-ui-template  
- Fumadocs docs: https://fumadocs.dev/docs  
- Create Fumadocs: https://fumadocs.dev/docs/guides/create-fumadocs
