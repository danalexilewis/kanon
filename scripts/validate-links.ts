/**
 * Validate internal links in content/ MDX and Markdown files.
 * Run with: pnpm run validate-links
 */
import {
  printErrors,
  readFiles,
  scanURLs,
  validateFiles,
} from "next-validate-link";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const CONTENT_DIR = join(process.cwd(), "content");
const BASE_URL = "/docs";

/** Path to URL: content/guides/foo.mdx -> /docs/guides/foo */
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

/** Collect slugs for docs/[[...slug]] route. */
function getDocSlugs(): { slug: string[] }[] {
  const result: { slug: string[] }[] = [];

  function collect(dir: string, prefix: string[]): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name.replace(/\.(md|mdx)$/, "");
      if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
        const slug = name === "index" ? prefix : [...prefix, name];
        result.push({ slug });
      } else if (entry.isDirectory()) {
        collect(join(dir, entry.name), [...prefix, entry.name]);
      }
    }
  }

  collect(CONTENT_DIR, []);
  return result;
}

async function checkLinks(): Promise<void> {
  const files = await readFiles("content/**/*.{md,mdx}", { pathToUrl });
  const slugs = getDocSlugs();

  const scanned = await scanURLs({
    preset: "next",
    populate: {
      "docs/[[...slug]]": slugs.map((s) => ({
        value: { slug: s.slug },
        hashes: [],
      })),
    },
  });

  const results = await validateFiles(files, {
    scanned,
    checkRelativePaths: "as-url",
    markdown: {
      components: {
        Card: { attributes: ["href"] },
        Callout: { attributes: ["href"] },
      },
    },
  });

  const errorCount = results.reduce((sum, r) => sum + r.errors.length, 0);

  if (errorCount > 0) {
    printErrors(results, true);
    process.exit(1);
  }

  console.log(`Validated ${files.length} files — no broken links.`);
}

void checkLinks().catch((error) => {
  console.error("Link validation failed:", error);
  process.exit(1);
});
