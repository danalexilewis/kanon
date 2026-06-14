#!/usr/bin/env tsx
/**
 * Automatic link fixing utility for Kanon content
 *
 * This script can automatically fix common link issues:
 * - Convert relative paths to absolute paths
 * - Fix common typos in internal links
 * - Update outdated external URLs
 *
 * Run with: tsx scripts/fix-links.ts [--dry-run] [--pattern=content glob]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { glob } from "glob";
import { resolve, relative, dirname, join } from "node:path";

interface LinkFix {
  file: string;
  line: number;
  original: string;
  fixed: string;
  reason: string;
}

/** Common link patterns and their fixes */
const LINK_FIXES: Record<string, string> = {
  // Fix common typos in internal paths
  "/docs/guide/": "/docs/guides/",
  "/doc/": "/docs/",
  // Add more as needed
};

/** Extract all markdown links from content */
function extractLinks(
  content: string,
): Array<{ match: string; url: string; line: number }> {
  const links: Array<{ match: string; url: string; line: number }> = [];
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    // Match markdown links [text](url)
    const markdownLinks = line.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g);
    for (const match of markdownLinks) {
      links.push({
        match: match[0],
        url: match[2],
        line: index + 1,
      });
    }

    // Match component links like <Card href="url">
    const componentLinks = line.matchAll(
      /<\w+[^>]*href=["']([^"']+)["'][^>]*>/g,
    );
    for (const match of componentLinks) {
      links.push({
        match: match[0],
        url: match[1],
        line: index + 1,
      });
    }
  });

  return links;
}

/** Check if a relative path exists */
function checkRelativePath(basePath: string, relativePath: string): boolean {
  try {
    const fullPath = resolve(dirname(basePath), relativePath);
    const fs = require("fs");
    return fs.existsSync(fullPath);
  } catch {
    return false;
  }
}

/** Generate fixes for a file */
async function generateFixes(filePath: string): Promise<LinkFix[]> {
  const content = readFileSync(filePath, "utf-8");
  const links = extractLinks(content);
  const fixes: LinkFix[] = [];

  for (const link of links) {
    const { url, line, match } = link;

    // Fix common typos
    for (const [typo, correction] of Object.entries(LINK_FIXES)) {
      if (url.includes(typo)) {
        const fixed = url.replace(typo, correction);
        fixes.push({
          file: filePath,
          line,
          original: match,
          fixed: match.replace(url, fixed),
          reason: `Fixed typo: ${typo} → ${correction}`,
        });
        continue;
      }
    }

    // Check relative paths
    if (url.startsWith("./") || url.startsWith("../")) {
      if (!checkRelativePath(filePath, url)) {
        // Try common fixes
        const mdxVersion = url.replace(/\.md$/, ".mdx");
        if (checkRelativePath(filePath, mdxVersion)) {
          fixes.push({
            file: filePath,
            line,
            original: match,
            fixed: match.replace(url, mdxVersion),
            reason: "Fixed extension: .md → .mdx",
          });
        }
      }
    }
  }

  return fixes;
}

/** Apply fixes to files */
async function applyFixes(fixes: LinkFix[], dryRun: boolean): Promise<void> {
  const fileGroups = new Map<string, LinkFix[]>();

  // Group fixes by file
  for (const fix of fixes) {
    if (!fileGroups.has(fix.file)) {
      fileGroups.set(fix.file, []);
    }
    fileGroups.get(fix.file)!.push(fix);
  }

  for (const [filePath, fileFixes] of fileGroups) {
    let content = readFileSync(filePath, "utf-8");

    // Apply fixes in reverse order to preserve line numbers
    const sortedFixes = fileFixes.sort((a, b) => b.line - a.line);

    for (const fix of sortedFixes) {
      content = content.replace(fix.original, fix.fixed);
      console.log(
        `${dryRun ? "[DRY RUN] " : ""}Fixed in ${relative(process.cwd(), fix.file)}:${fix.line}`,
      );
      console.log(`  ${fix.reason}`);
      console.log(`  - ${fix.original}`);
      console.log(`  + ${fix.fixed}`);
      console.log();
    }

    if (!dryRun) {
      writeFileSync(filePath, content);
    }
  }
}

/** Main function */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const patternArg = args.find((arg) => arg.startsWith("--pattern="));
  const pattern = patternArg
    ? patternArg.split("=")[1]
    : "content/**/*.{md,mdx}";

  console.log("🔧 Kanon Link Fixer");
  console.log("=".repeat(40));
  console.log(`Pattern: ${pattern}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "APPLY FIXES"}`);
  console.log();

  try {
    const files = await glob(pattern);
    console.log(`Found ${files.length} files to check`);

    const allFixes: LinkFix[] = [];

    for (const file of files) {
      const fixes = await generateFixes(file);
      allFixes.push(...fixes);
    }

    if (allFixes.length === 0) {
      console.log("✅ No link issues found!");
      return;
    }

    console.log(`Found ${allFixes.length} potential fixes:`);
    console.log();

    await applyFixes(allFixes, dryRun);

    if (dryRun) {
      console.log("💡 Run without --dry-run to apply these fixes");
    } else {
      console.log("✅ All fixes applied! Run link validation to verify.");
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
