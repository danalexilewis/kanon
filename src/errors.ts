import { railError, type RailError } from '@eddy-works/never-rest';

/** Same code for unknown and ungranted indexes — do not leak names. */
export function indexNotAvailable(): RailError<'index_not_available'> {
  return railError('index_not_available', 'Index is not available');
}

export function notFound(): RailError<'not_found'> {
  return railError('not_found', 'Document is not available');
}

export function citationMismatch(): RailError<'citation_mismatch'> {
  return railError(
    'citation_mismatch',
    'Live file does not match the indexed revision',
  );
}

export function invalidConfig(message: string): RailError<'invalid_config'> {
  return railError('invalid_config', message);
}

export function syncBlocked(message: string): RailError<'sync_blocked'> {
  return railError('sync_blocked', message);
}

export function qmdUnavailable(message: string): RailError<'qmd_unavailable'> {
  return railError('qmd_unavailable', message);
}
