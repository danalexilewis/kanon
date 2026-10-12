export interface QueueSelectable {
  readonly uri: string;
  readonly externalId: string;
  readonly docId: string;
  readonly title: string;
  readonly relativeDir: string;
}

/**
 * Glob with `*` and `?` only. Titles match case-insensitively.
 */
export function matchGlob(pattern: string, value: string, ignoreCase = false): boolean {
  const hay = ignoreCase ? value.toLowerCase() : value;
  const pat = ignoreCase ? pattern.toLowerCase() : pattern;
  const escaped = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`).test(hay);
}

/** A folder path matches that directory and its descendants. `.` is the scope root. */
export function folderMatches(relativeDir: string, folder: string): boolean {
  const normalized = folder.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (normalized === '' || normalized === '.') {
    return relativeDir === '';
  }
  return relativeDir === normalized || relativeDir.startsWith(`${normalized}/`);
}

export function resolveScanUri(items: readonly QueueSelectable[], token: string): string {
  const uri = token.includes('://') ? token : `gdrive://${token}`;
  const found = items.find(
    (item) => item.uri === uri || item.externalId === token || item.docId === token,
  );
  return found?.uri ?? uri;
}

/**
 * Union of explicit tokens, `--folder` matches and `--title` globs.
 */
export function selectQueuedUris(args: {
  readonly items: readonly QueueSelectable[];
  readonly tokens: readonly string[];
  readonly folder?: string;
  readonly title?: string;
}): string[] {
  const selected = new Set<string>();
  for (const token of args.tokens) {
    selected.add(resolveScanUri(args.items, token));
  }
  if (args.folder !== undefined) {
    for (const item of args.items) {
      if (folderMatches(item.relativeDir, args.folder)) {
        selected.add(item.uri);
      }
    }
  }
  if (args.title !== undefined) {
    for (const item of args.items) {
      if (matchGlob(args.title, item.title, true)) {
        selected.add(item.uri);
      }
    }
  }
  return [...selected];
}
