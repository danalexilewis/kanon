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

export function remoteUnavailable(message: string): RailError<'remote_unavailable'> {
  return railError('remote_unavailable', message, { retryable: true });
}

/** The operator's git credentials cannot open the remote for writing. */
export function writeDenied(message: string): RailError<'write_denied'> {
  return railError('write_denied', message, {
    nextStep: 'Check push access to the remote, or set the source to access: read',
  });
}

/** The remote refused the push (branch protection, hooks, or a moved tip). */
export function pushRejected(message: string): RailError<'push_rejected'> {
  return railError('push_rejected', message);
}

export function connectorFailed(message: string): RailError<'connector_failed'> {
  return railError('connector_failed', message, { retryable: true });
}

export function connectorAuthRequired(
  connectorId: string,
): RailError<'connector_auth_required'> {
  return railError('connector_auth_required', `Connector ${connectorId} needs credentials`, {
    nextStep: `Run kanon connector auth ${connectorId}`,
  });
}

export function unsupportedFormat(message: string): RailError<'unsupported_format'> {
  return railError('unsupported_format', message);
}

export function jobLocked(message: string): RailError<'job_locked'> {
  return railError('job_locked', message, { retryable: true });
}
