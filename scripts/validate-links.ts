/**
 * Validate links in content Markdown/MDX files using next-validate-link.
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
} from "next-validate-link";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

async function checkLinks() {
  const files = await readFiles("content/**/*.{md,mdx}", {
    pathToUrl,
  });

  const slugs = getDocSlugs();
  const scanned = await scanURLs({
    preset: "next",
    populate: {
      "docs/[[...slug]]": slugs.map((s) => ({
        value: { slug: s.slug },
        hashes: [], // heading validation would require parsing MDX
      })),
    },
  });

  const results = await validateFiles(files, {
    scanned,
    checkRelativePaths: "as-url",
    markdown: {
      components: {
        Card: { attributes: ["href"] },
      },
    },
  });

  printErrors(results, true);
}

void checkLinks();
