import { createMDX } from 'fumadocs-mdx/next';
import { withSerwist } from "@serwist/turbopack";

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  serverExternalPackages: ['typescript', 'twoslash'],
};

const withMDX = createMDX();
export default withSerwist(withMDX(config));
