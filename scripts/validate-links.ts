/**
 * Enhanced link validation for Kanon content files.
 *
 * Features:
 * - Validates all internal and external links in MDX/MD files
 * - Reports detailed statistics and broken link information
 * - Supports Fumadocs-specific components (Cards, Callouts)
 * - Provides actionable error messages with file locations
 *
 * Run with: pnpm run validate-links
 *
 * For full Fumadocs integration (heading/fragment validation), run with Bun
 * and Fumadocs MDX Loader; see https://www.fumadocs.dev/docs/integrations/validate-links
 */
import {
  printErrors,
  readFiles,
  scanURLs,
  validateFiles,
  type ValidationResult,
} from "next-validate-link";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { performance } from "node:perf_hooks";

const CONTENT_DIR = join(process.cwd(), "content");
const BASE_URL = "/docs";

/** Path to URL: content/docs/foo.mdx -> /docs/foo, content/index.mdx -> /docs */
function pathToUrl(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  if (!normalized.startsWith("content/")) return undefined;
  const relative = normalized
    .replace(/^content\//, "")
    .replace(/\.(md|mdx)$/, "");
  if (relative === "index") return BASE_URL;
  const slugPart = relative.replace(/^docs\/?/, "");
  return slugPart ? `${BASE_URL}/${slugPart}` : BASE_URL;
}

/** Collect slugs for docs/[[...slug]]: all content/ paths (index → [], else path segments). */
function getDocSlugs(): { slug: string[] }[] {
  const result: { slug: string[] }[] = [];
  function collect(dir: string, prefix: string[]): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const name = e.name.replace(/\.(md|mdx)$/, "");
      if (e.isFile() && /\.(md|mdx)$/i.test(e.name)) {
        const slug = name === "index" ? prefix : [...prefix, name];
        result.push({ slug });
      } else if (e.isDirectory()) {
        collect(join(dir, e.name), [...prefix, e.name]);
      }
    }
  }
  collect(CONTENT_DIR, []);
  return result;
}

/** Print enhanced validation summary with statistics and actionable insights */
function printValidationSummary(results: ValidationResult[], startTime: number): void {
  const endTime = performance.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Calculate statistics
  const totalFiles = results.length;
  const filesWithErrors = results.filter((r) => r.errors.length > 0).length;
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalLinks = results.reduce((sum, r) => sum + r.links.length, 0);

  console.log("\n" + "=".repeat(60));
  console.log("📊 LINK VALIDATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`✅ Validated ${totalFiles} files in ${duration}s`);
  console.log(`🔗 Total links checked: ${totalLinks}`);
  console.log(`❌ Total errors: ${totalErrors}`);
  console.log(`📁 Files with errors: ${filesWithErrors}/${totalFiles}`);

  if (totalErrors === 0) {
    console.log("\n🎉 All links are valid! No issues found.");
    return;
  }

  // Group errors by type for better reporting
  const errorTypes = new Map<string, number>();
  const brokenLinks = new Set<string>();

  results.forEach((result) => {
    result.errors.forEach((error) => {
      const errorType = error.message.includes("404") ? "404 Not Found" :
                       error.message.includes("timeout") ? "Timeout" :
                       error.message.includes("relative") ? "Invalid Relative Path" :
                       "Other";

      errorTypes.set(errorType, (errorTypes.get(errorType) || 0) + 1);
      brokenLinks.add(error.link);
    });
  });

  console.log("\n📋 Error breakdown:");
  errorTypes.forEach((count, type) => {
    console.log(`   ${type}: ${count}`);
  });

  console.log(`\n🔗 Unique broken links: ${brokenLinks.size}`);

  if (brokenLinks.size > 0) {
    console.log("\n💡 QUICK FIXES:");
    brokenLinks.forEach((link) => {
      if (link.startsWith("/docs/")) {
        console.log(`   • Check if file exists: content${link.replace("/docs", "")}.mdx`);
      } else if (link.startsWith("./") || link.startsWith("../")) {
        console.log(`   • Verify relative path: ${link}`);
      } else if (link.startsWith("http")) {
        console.log(`   • External link may be down: ${link}`);
      }
    });
  }

  console.log("\n" + "=".repeat(60));
}

/** Enhanced link validation with better error reporting */
async function checkLinks(): Promise<void> {
  const startTime = performance.now();

  console.log("🔍 Starting enhanced link validation...");
  console.log(`📂 Content directory: ${relative(process.cwd(), CONTENT_DIR)}`);

  try {
    const files = await readFiles("content/**/*.{md,mdx}", {
      pathToUrl,
    });

    console.log(`📄 Found ${files.length} content files`);

    const slugs = getDocSlugs();
    console.log(`🎯 Generated ${slugs.length} route slugs`);

    const scanned = await scanURLs({
      preset: "next",
      populate: {
        "docs/[[...slug]]": slugs.map((s) => ({
          value: { slug: s.slug },
          hashes: [], // heading validation would require parsing MDX
        })),
      },
    });

    console.log("⚡ Validating links...");

    const results = await validateFiles(files, {
      scanned,
      checkRelativePaths: "as-url",
      markdown: {
        components: {
          Card: { attributes: ["href"] },
          // Add other Fumadocs components that might have links
          Callout: { attributes: ["href"] },
        },
      },
    });

    // Print detailed results
    printValidationSummary(results, startTime);

    // Still use the original printErrors for detailed error messages
    if (results.some((r) => r.errors.length > 0)) {
      console.log("\n📝 DETAILED ERROR REPORT:");
      printErrors(results, true);
    }

    // Exit with error code if validation failed
    const hasErrors = results.some((r) => r.errors.length > 0);
    if (hasErrors) {
      process.exit(1);
    }

  } catch (error) {
    console.error("❌ Link validation failed:", error);
    process.exit(1);
  }
}

void checkLinks();
