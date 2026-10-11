import type { Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';

/** Formats a connector can hand over. Converters for docx, pdf, etc. come later. */
export type ConnectorFormat = 'markdown';

export interface ConnectorScope {
  /** Connector-specific container id, e.g. a Google Drive folder id. */
  readonly folder: string;
}

export interface ConnectorItem {
  readonly externalId: string;
  /** Stable provenance URI, e.g. `gdrive://<fileId>`. */
  readonly uri: string;
  readonly title: string;
  /** Folder path below the scope root, `/`-separated. */
  readonly relativeDir: string;
  /** Changes whenever the item changes upstream. */
  readonly revision: string;
  readonly formats: readonly ConnectorFormat[];
  readonly mimeType?: string;
  readonly webUrl?: string;
}

export type ConnectorError = RailError<'connector_failed' | 'connector_auth_required'>;

/** A source of external documents. Plain functions, no classes. */
export interface Connector {
  readonly kind: string;
  /** URI scheme of its items; files under a job target carrying it belong to that job. */
  readonly scheme: string;
  readonly list: (
    scope: ConnectorScope,
  ) => Promise<Result<readonly ConnectorItem[], ConnectorError>>;
  readonly read: (
    item: ConnectorItem,
    format: ConnectorFormat,
  ) => Promise<Result<string, ConnectorError | RailError<'unsupported_format'>>>;
}
