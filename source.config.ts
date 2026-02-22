import { defineConfig, defineDocs } from "fumadocs-mdx/config";

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
  },
});
