# Enhanced Link Validation for Kanon

This directory contains enhanced link validation tools for the Kanon knowledge management system.

## 🔧 Tools Available

### 1. `validate-links.ts` - Enhanced Link Validator

An improved version of the original link validation script with:

- **📊 Detailed Statistics** - Shows total files, links checked, error counts
- **🎯 Error Categorization** - Groups errors by type (404, timeout, relative path issues)
- **💡 Actionable Suggestions** - Provides specific fix recommendations
- **⚡ Performance Timing** - Shows validation duration
- **🚨 Error Exit Codes** - Proper CI/CD integration

**Usage:**
```bash
pnpm run validate-links
```

**Features:**
- Validates all markdown and MDX files in `content/`
- Checks internal links (within your docs)
- Validates external URLs
- Supports Fumadocs components (Card, Callout)
- Provides detailed error reports with file locations

### 2. `fix-links.ts` - Automatic Link Fixer

Automatically fixes common link issues in your content files.

**Usage:**
```bash
# Preview fixes without applying them
pnpm run fix-links:dry-run

# Apply fixes to all files
pnpm run fix-links

# Fix specific pattern
tsx scripts/fix-links.ts --pattern="content/guides/*.mdx"
```

**What it fixes:**
- Common typos in internal paths (`/guide/` → `/guides/`)
- File extension mismatches (`.md` → `.mdx`)
- Missing relative paths
- Outdated URL patterns

### 3. `link-validation.config.ts` - Configuration

Centralized configuration for link validation behavior:

```typescript
export const defaultConfig = {
  baseUrl: "/docs",
  contentDir: "content",
  allowedExternalDomains: ["fumadocs.dev", "nextjs.org", "github.com"],
  externalLinkTimeout: 5000,
  skipExternalLinks: false,
  componentLinkAttributes: {
    Card: ["href"],
    Callout: ["href"]
  }
};
```

## 🚀 Quick Start

1. **Run validation** to check your current links:
   ```bash
   pnpm run validate-links
   ```

2. **Auto-fix common issues** (dry run first):
   ```bash
   pnpm run fix-links:dry-run
   pnpm run fix-links
   ```

3. **Validate again** to confirm fixes:
   ```bash
   pnpm run validate-links
   ```

## 🔄 CI/CD Integration

The enhanced validator returns proper exit codes for CI integration:

```yaml
# In your GitHub Actions workflow
- name: Validate Links
  run: pnpm run validate-links
```

If any links are broken, the process exits with code 1, failing the CI build.

## 📋 Sample Output

```
🔍 Starting enhanced link validation...
📂 Content directory: content
📄 Found 3 content files
🎯 Generated 4 route slugs
⚡ Validating links...

============================================================
📊 LINK VALIDATION SUMMARY
============================================================
✅ Validated 3 files in 0.45s
🔗 Total links checked: 12
❌ Total errors: 0
📁 Files with errors: 0/3

🎉 All links are valid! No issues found.
============================================================
```

## 🛠️ Customization

### Adding New Component Support

To validate links in custom MDX components, update `link-validation.config.ts`:

```typescript
componentLinkAttributes: {
  Card: ["href"],
  Callout: ["href"],
  CustomButton: ["href", "linkUrl"], // Add your components
}
```

### Adding Common Link Fixes

Update `fix-links.ts` to handle new patterns:

```typescript
const LINK_FIXES: Record<string, string> = {
  "/docs/guide/": "/docs/guides/",
  "/doc/": "/docs/",
  "/old-path/": "/new-path/", // Add your patterns
};
```

### External Link Configuration

Control external link checking in the config:

```typescript
// Skip external links entirely (faster validation)
skipExternalLinks: true,

// Only check specific domains
allowedExternalDomains: ["fumadocs.dev", "your-domain.com"],

// Increase timeout for slow external sites
externalLinkTimeout: 10000, // 10 seconds
```

## 🏗️ Architecture

The enhanced system is built on:

- **next-validate-link** - Core validation engine
- **Custom error reporting** - Better UX for developers
- **Configurable components** - Fumadocs MDX support
- **Automated fixing** - Reduce manual link maintenance

## 🤝 Contributing

When adding new features:

1. Update the TypeScript interfaces in `link-validation.config.ts`
2. Add corresponding logic in `validate-links.ts` or `fix-links.ts`
3. Update this README with usage examples
4. Test with real content files

## 📚 Related

- [Fumadocs Link Validation](https://www.fumadocs.dev/docs/integrations/validate-links)
- [next-validate-link](https://github.com/next-validate-link/next-validate-link)
- [Kanon Documentation](../README.md)