/**
 * Configuration for enhanced link validation in Kanon
 */

export interface LinkValidationConfig {
  /** Base URL for the docs site */
  baseUrl: string;
  /** Content directory relative to project root */
  contentDir: string;
  /** External domains to check (empty array = check all) */
  allowedExternalDomains: string[];
  /** Timeout for external link checks (ms) */
  externalLinkTimeout: number;
  /** Skip external link validation entirely */
  skipExternalLinks: boolean;
  /** Fumadocs component attributes that contain links */
  componentLinkAttributes: Record<string, string[]>;
  /** File patterns to validate */
  filePatterns: string[];
}

export const defaultConfig: LinkValidationConfig = {
  baseUrl: "/docs",
  contentDir: "content",
  allowedExternalDomains: [
    "fumadocs.dev",
    "nextjs.org",
    "github.com",
    "eddy.works",
  ],
  externalLinkTimeout: 5000,
  skipExternalLinks: false,
  componentLinkAttributes: {
    Card: ["href"],
    Callout: ["href"],
    // Add more Fumadocs components as needed
  },
  filePatterns: ["content/**/*.{md,mdx}"],
};

/** Load and merge user config with defaults */
export function loadConfig(): LinkValidationConfig {
  // In the future, this could load from a config file
  // For now, return the default configuration
  return defaultConfig;
}