import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { transformerTwoslash } from "fumadocs-twoslash";
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins";

/**
 * Single docs collection: the whole Fumadocs content folder.
 * Structure (docs, entities, events) is defined by content/meta.json.
 */
export const docs = defineDocs({
  dir: "content",
});

export default defineConfig({
  mdxOptions: {
    providerImportSource: "@/mdx-components",
    rehypeCodeOptions: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        transformerTwoslash(),
      ],
      // Shiki doesn't support lazy loading languages for codeblocks in Twoslash popups
      langs: ["js", "jsx", "ts", "tsx"],
    },
  },
});
