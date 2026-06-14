# Scripts

## Link validation

```bash
pnpm run validate-links
```

Checks internal links in `content/**/*.md` and `content/**/*.mdx`. Runs automatically on pre-commit via Husky.

## Optional link fixes

```bash
pnpm run fix-links:dry-run
pnpm run fix-links
```

Fixes common internal link typos. Run manually when needed.
