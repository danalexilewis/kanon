import { z } from 'zod';

export const sourceRootSchema = z
  .object({
    path: z.string().min(1),
    pattern: z.string().min(1).default('**/*.md'),
    context: z.string().optional(),
  })
  .strict();

export const sourceManifestSchema = z
  .object({
    schema: z.literal('kanon/source/v1'),
    id: z.string().uuid(),
    name: z.string().min(1),
    roots: z.array(sourceRootSchema).min(1),
    exclude: z.array(z.string()).default([]),
  })
  .strict();

export const documentSourceRefSchema = z
  .object({
    uri: z.string().min(1),
    revision: z.string().optional(),
    relation: z.string().optional(),
  })
  .strict();

export const documentDocSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().optional(),
    kind: z.enum(['source', 'reference', 'derivative']).optional(),
    status: z.string().optional(),
    owner: z.string().optional(),
    sources: z.array(documentSourceRefSchema).optional(),
  })
  .strict();

const slugSchema = z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/);

export const cadenceSchema = z.enum(['off', 'hourly', 'daily', 'weekly']);

export const machineSourceSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['managed', 'local']),
    path: z.string().min(1),
    remote: z.string().optional(),
    branch: z.string().optional(),
    access: z.enum(['read', 'write']).optional(),
    refresh: cadenceSchema.optional(),
  })
  .strict();

export const machineIndexSchema = z
  .object({
    id: slugSchema,
    sources: z.array(z.string().uuid()).min(1),
    embed: z.boolean().optional(),
  })
  .strict();

export const machineProjectSchema = z
  .object({
    id: slugSchema,
    root: z.string().min(1),
  })
  .strict();

export const machineGrantSchema = z
  .object({
    project: z.string().min(1),
    indexes: z.array(z.string().min(1)),
  })
  .strict();

export const machineConnectorSchema = z
  .object({
    id: slugSchema,
    kind: z.enum(['google-drive']),
    auth: z.enum(['oauth', 'service-account']),
  })
  .strict();

export const machineIngestSchema = z
  .object({
    id: slugSchema,
    connector: z.string().min(1),
    source: z.string().uuid(),
    folder: z.string().min(1),
    target: z.string().min(1),
    schedule: cadenceSchema.optional(),
    images: z.enum(['extract', 'strip']).optional(),
    author: z
      .object({ name: z.string().min(1), email: z.string().min(1) })
      .strict()
      .optional(),
    device: slugSchema.optional(),
  })
  .strict();

function normalizeTarget(target: string): string {
  return target.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function isRelativeTarget(target: string): boolean {
  const normalized = normalizeTarget(target);
  return (
    normalized.length > 0 &&
    normalized !== '.' &&
    !normalized.startsWith('/') &&
    !/^[a-zA-Z]:/.test(normalized) &&
    !normalized.split('/').includes('..')
  );
}

export const machineConfigSchema = z
  .object({
    schema: z.literal('kanon/machine/v1'),
    sources: z.array(machineSourceSchema),
    indexes: z.array(machineIndexSchema),
    projects: z.array(machineProjectSchema),
    grants: z.array(machineGrantSchema),
    connectors: z.array(machineConnectorSchema).optional(),
    ingest: z.array(machineIngestSchema).optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    config.sources.forEach((source, index) => {
      if (source.access !== 'write') {
        return;
      }
      if (source.kind !== 'managed') {
        ctx.addIssue({
          code: 'custom',
          path: ['sources', index, 'access'],
          message: `Source ${source.id}: access: write needs kind: managed`,
        });
      }
      if (source.remote === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['sources', index, 'remote'],
          message: `Source ${source.id}: access: write needs a remote`,
        });
      }
    });

    const connectorIds = new Set<string>();
    (config.connectors ?? []).forEach((connector, index) => {
      if (connectorIds.has(connector.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['connectors', index, 'id'],
          message: `Duplicate connector id ${connector.id}`,
        });
      }
      connectorIds.add(connector.id);
    });

    const jobIds = new Set<string>();
    const targets = new Set<string>();
    (config.ingest ?? []).forEach((job, index) => {
      if (jobIds.has(job.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['ingest', index, 'id'],
          message: `Duplicate ingest id ${job.id}`,
        });
      }
      jobIds.add(job.id);

      if (!connectorIds.has(job.connector)) {
        ctx.addIssue({
          code: 'custom',
          path: ['ingest', index, 'connector'],
          message: `Ingest ${job.id}: unknown connector ${job.connector}`,
        });
      }

      const source = config.sources.find((entry) => entry.id === job.source);
      if (source === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['ingest', index, 'source'],
          message: `Ingest ${job.id}: unknown source ${job.source}`,
        });
      } else if (
        source.kind !== 'managed' ||
        source.access !== 'write' ||
        source.remote === undefined
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['ingest', index, 'source'],
          message: `Ingest ${job.id}: source must be managed with access: write and a remote`,
        });
      }

      if (!isRelativeTarget(job.target)) {
        ctx.addIssue({
          code: 'custom',
          path: ['ingest', index, 'target'],
          message: `Ingest ${job.id}: target must be a relative path inside the source`,
        });
      }
      const targetKey = `${job.source}:${normalizeTarget(job.target)}`;
      if (targets.has(targetKey)) {
        ctx.addIssue({
          code: 'custom',
          path: ['ingest', index, 'target'],
          message: `Ingest ${job.id}: target is already owned by another job`,
        });
      }
      targets.add(targetKey);
    });
  });

export const deviceSchema = z
  .object({
    schema: z.literal('kanon/device/v1'),
    id: z.string().uuid(),
    name: slugSchema,
  })
  .strict();

export type SourceRoot = z.infer<typeof sourceRootSchema>;
export type SourceManifest = z.infer<typeof sourceManifestSchema>;
export type DocumentDoc = z.infer<typeof documentDocSchema>;
export type Cadence = z.infer<typeof cadenceSchema>;
export type MachineSource = z.infer<typeof machineSourceSchema>;
export type MachineIndex = z.infer<typeof machineIndexSchema>;
export type MachineProject = z.infer<typeof machineProjectSchema>;
export type MachineGrant = z.infer<typeof machineGrantSchema>;
export type MachineConnector = z.infer<typeof machineConnectorSchema>;
export type MachineIngest = z.infer<typeof machineIngestSchema>;
export type MachineConfig = z.infer<typeof machineConfigSchema>;
export type Device = z.infer<typeof deviceSchema>;

export function sourceAccess(source: MachineSource): 'read' | 'write' {
  return source.access ?? 'read';
}

export function sourceRefresh(source: MachineSource): Cadence {
  return source.refresh ?? 'daily';
}

export function sourceBranch(source: MachineSource): string {
  return source.branch ?? 'main';
}

export function ingestSchedule(job: MachineIngest): Cadence {
  return job.schedule ?? 'daily';
}

/** Normalised repo-relative target, e.g. `docs/policies`. */
export function ingestTarget(job: MachineIngest): string {
  return normalizeTarget(job.target);
}

export function indexesContainingSource(
  config: MachineConfig,
  sourceId: string,
): readonly string[] {
  return config.indexes
    .filter((index) => index.sources.includes(sourceId))
    .map((index) => index.id);
}

export function emptyMachineConfig(): MachineConfig {
  return {
    schema: 'kanon/machine/v1',
    sources: [],
    indexes: [],
    projects: [],
    grants: [],
  };
}
