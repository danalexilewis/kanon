import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';

import type { RailError } from '@eddy-works/never-rest';
import { connectorAuthRequired, invalidConfig } from '../../errors.js';
import { readCredentials } from '../credentials.js';

const oauthCredentialsSchema = z
  .object({
    type: z.literal('oauth'),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    refreshToken: z.string().min(1).optional(),
  })
  .strict();

const serviceAccountCredentialsSchema = z
  .object({
    type: z.literal('service-account'),
    clientEmail: z.string().min(1),
    privateKey: z.string().min(1),
  })
  .strict();

export const googleCredentialsSchema = z.discriminatedUnion('type', [
  oauthCredentialsSchema,
  serviceAccountCredentialsSchema,
]);

export type GoogleOAuthCredentials = z.infer<typeof oauthCredentialsSchema>;
export type GoogleCredentials = z.infer<typeof googleCredentialsSchema>;

const clientSecretFileSchema = z.object({
  installed: z.object({ client_id: z.string().min(1), client_secret: z.string().min(1) }).optional(),
  web: z.object({ client_id: z.string().min(1), client_secret: z.string().min(1) }).optional(),
});

const serviceAccountFileSchema = z.object({
  type: z.literal('service_account'),
  client_email: z.string().min(1),
  private_key: z.string().min(1),
});

/** Read the `client_secret_*.json` downloaded for a Desktop OAuth client. */
export function parseClientSecretFile(
  value: unknown,
): Result<GoogleOAuthCredentials, RailError<'invalid_config'>> {
  const parsed = clientSecretFileSchema.safeParse(value);
  const client = parsed.success ? (parsed.data.installed ?? parsed.data.web) : undefined;
  if (client === undefined) {
    return err(invalidConfig('Not a Google OAuth client secret file (expected an "installed" client)'));
  }
  return ok({ type: 'oauth', clientId: client.client_id, clientSecret: client.client_secret });
}

/** Read a service-account key file. */
export function parseServiceAccountFile(
  value: unknown,
): Result<GoogleCredentials, RailError<'invalid_config'>> {
  const parsed = serviceAccountFileSchema.safeParse(value);
  if (!parsed.success) {
    return err(invalidConfig('Not a Google service-account key file'));
  }
  return ok({
    type: 'service-account',
    clientEmail: parsed.data.client_email,
    privateKey: parsed.data.private_key,
  });
}

export async function loadGoogleCredentials(
  connectorId: string,
): Promise<Result<GoogleCredentials, RailError<'connector_auth_required'>>> {
  const parsed = googleCredentialsSchema.safeParse(await readCredentials(connectorId));
  if (!parsed.success) {
    return err(connectorAuthRequired(connectorId));
  }
  return ok(parsed.data);
}
