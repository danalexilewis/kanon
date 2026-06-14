import { createMDX } from 'fumadocs-mdx/next';
import { withSerwist } from "@serwist/turbopack";

const isDev = process.env.NODE_ENV === "development";

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  serverExternalPackages: ['typescript', 'twoslash'],
  pageExtensions: isDev
    ? ["tsx", "ts", "jsx", "js", "mdx", "dev.tsx", "dev.ts"]
    : ["tsx", "ts", "jsx", "js", "mdx"],
};

const withMDX = createMDX();
export default withSerwist(withMDX(config));
