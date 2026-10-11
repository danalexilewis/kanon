import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { CodeChallengeMethod, JWT, OAuth2Client } from 'google-auth-library';
import { err, ok, type Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import { connectorAuthRequired, connectorFailed, invalidConfig } from '../../errors.js';
import { writeCredentials } from '../credentials.js';
import { loadGoogleCredentials, type GoogleCredentials } from './credentials.js';

/** Read-only Drive access. Kanon never writes to Drive. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

export type AccessTokenProvider = () => Promise<string>;

/** Build a token source: refresh-token OAuth or a service-account JWT. */
export function accessTokenProvider(
  credentials: GoogleCredentials,
  connectorId: string,
): Result<AccessTokenProvider, RailError<'connector_auth_required'>> {
  if (credentials.type === 'oauth') {
    if (credentials.refreshToken === undefined) {
      return err(connectorAuthRequired(connectorId));
    }
    const client = new OAuth2Client({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
    });
    client.setCredentials({ refresh_token: credentials.refreshToken });
    return ok(async () => {
      const { token } = await client.getAccessToken();
      if (token === null || token === undefined) {
        throw new Error('Google returned no access token');
      }
      return token;
    });
  }
  const jwt = new JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes: [DRIVE_SCOPE],
  });
  return ok(async () => {
    const { token } = await jwt.getAccessToken();
    if (token === null || token === undefined) {
      throw new Error('Google returned no access token');
    }
    return token;
  });
}

export function openInBrowser(url: string): void {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  try {
    const child = spawn(opener, [url], { stdio: 'ignore', detached: true });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // The URL is also printed; opening a browser is a convenience.
  }
}

export interface AuthorizeDeps {
  readonly log: (line: string) => void;
  readonly openUrl?: (url: string) => void;
  readonly timeoutMs?: number;
  readonly tokenUrl?: string;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function waitForCode(
  server: Server,
  state: string,
  timeoutMs: number,
): Promise<Result<string, RailError<'connector_failed'>>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(err(connectorFailed('Timed out waiting for the Google sign-in redirect')));
    }, timeoutMs);
    server.on('request', (request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/oauth2callback') {
        response.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get('code');
      const problem = url.searchParams.get('error');
      const valid = url.searchParams.get('state') === state && code !== null;
      response
        .writeHead(valid ? 200 : 400, { 'content-type': 'text/plain; charset=utf-8' })
        .end(valid ? 'Kanon is connected. You can close this tab.' : 'Kanon sign-in failed.');
      clearTimeout(timer);
      resolve(
        valid
          ? ok(code)
          : err(connectorFailed(problem !== null ? `Google sign-in failed: ${problem}` : 'Invalid sign-in redirect')),
      );
    });
  });
}

/**
 * Desktop OAuth loopback flow with PKCE. Google still requires the client
 * secret at the token endpoint for Desktop clients. Stores the refresh token
 * in the connector's credentials file (0600).
 */
export async function authorizeOAuth(
  connectorId: string,
  deps: AuthorizeDeps,
): Promise<Result<void, RailError<'connector_auth_required' | 'connector_failed' | 'invalid_config'>>> {
  const credentials = await loadGoogleCredentials(connectorId);
  if (credentials.isErr()) {
    return err(credentials.error);
  }
  if (credentials.value.type !== 'oauth') {
    return err(invalidConfig('Service-account connectors do not need a browser sign-in'));
  }
  const oauth = credentials.value;
  const server = createServer();
  try {
    const port = await listen(server);
    const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
    const client = new OAuth2Client({
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
      redirectUri,
      ...(deps.tokenUrl !== undefined ? { endpoints: { oauth2TokenUrl: deps.tokenUrl } } : {}),
    });
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const state = randomBytes(16).toString('hex');
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [DRIVE_SCOPE],
      code_challenge_method: CodeChallengeMethod.S256,
      ...(codeChallenge !== undefined ? { code_challenge: codeChallenge } : {}),
      state,
    });
    deps.log(`Open this URL to connect Google Drive:\n${url}`);
    (deps.openUrl ?? openInBrowser)(url);

    const code = await waitForCode(server, state, deps.timeoutMs ?? 300_000);
    if (code.isErr()) {
      return err(code.error);
    }
    const { tokens } = await client.getToken({
      code: code.value,
      codeVerifier,
      redirect_uri: redirectUri,
    });
    if (tokens.refresh_token === null || tokens.refresh_token === undefined) {
      return err(connectorFailed('Google did not return a refresh token; revoke access and try again'));
    }
    await writeCredentials(connectorId, { ...oauth, refreshToken: tokens.refresh_token });
    return ok(undefined);
  } catch (error) {
    return err(connectorFailed(error instanceof Error ? error.message : String(error)));
  } finally {
    server.close();
  }
}
