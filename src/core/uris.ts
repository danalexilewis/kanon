export function documentUri(sourceId: string, docRef: string): string {
  return `kanon://${sourceId}/${docRef}`;
}

export function parseDocumentUri(
  uri: string,
): { readonly sourceId: string; readonly docRef: string } | undefined {
  if (!uri.startsWith('kanon://')) {
    return undefined;
  }
  const rest = uri.slice('kanon://'.length);
  const slash = rest.indexOf('/');
  if (slash <= 0 || slash === rest.length - 1) {
    return undefined;
  }
  return {
    sourceId: rest.slice(0, slash),
    docRef: rest.slice(slash + 1),
  };
}

export function isRawQmdUri(value: string): boolean {
  return value.startsWith('qmd://');
}

export function looksLikePathTraversal(value: string): boolean {
  return value.includes('..') || value.includes('\\');
}
