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

export const sensitivityLevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const documentAccessSchema = z
  .object({
    circle: z.string().min(1),
    level: sensitivityLevelSchema,
    basis: z.enum(['sharing', 'promotion']),
    readers: z.array(z.string().min(1)),
    others: z.number().int().nonnegative(),
    approver: z.string().min(1).optional(),
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
    access: documentAccessSchema.optional(),
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

export const machinePersonSchema = z
  .object({
    id: slugSchema,
    google: z.array(z.string().min(1)).min(1),
    github: z.string().min(1).optional(),
  })
  .strict();

export const machineCircleSchema = z
  .object({
    id: slugSchema,
    source: z.string().uuid(),
    members: z.array(slugSchema).min(1),
    ceiling: sensitivityLevelSchema,
    admit: z.enum(['auto', 'review']).optional(),
  })
  .strict();

export const machineScorerSchema = z
  .object({
    id: slugSchema,
    kind: z.literal('openai-compatible'),
    endpoint: z.string().min(1),
    model: z.string().min(1),
  })
  .strict();

export const machineIngestScoreSchema = z
  .object({
    scorer: z.string().min(1),
    for: z.array(slugSchema).min(1),
  })
  .strict();

export const machineIngestSchema = z
  .object({
    id: slugSchema,
    connector: z.string().min(1),
    /** Rejected. Use `route`. Kept so the error can name the move. */
    source: z.string().optional(),
    route: z.array(slugSchema).min(1),
    folder: z.string().min(1),
    target: z.string().min(1),
    schedule: cadenceSchema.optional(),
    images: z.enum(['extract', 'strip']).optional(),
    author: z
      .object({ name: z.string().min(1), email: z.string().min(1) })
      .strict()
      .optional(),
    device: slugSchema.optional(),
    score: machineIngestScoreSchema.optional(),
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

function isLoopbackEndpoint(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1';
  } catch {
    return false;
  }
}

function isHttpsOrLoopback(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:') {
      return true;
    }
    return url.protocol === 'http:' && isLoopbackEndpoint(raw);
  } catch {
    return false;
  }
}

function membersContain(wider: readonly string[], narrower: readonly string[]): boolean {
  const set = new Set(wider);
  return narrower.every((member) => set.has(member));
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
    people: z.array(machinePersonSchema).optional(),
    domains: z.array(z.string().min(1)).optional(),
    circles: z.array(machineCircleSchema).optional(),
    scorers: z.array(machineScorerSchema).optional(),
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

    const personIds = new Set<string>();
    (config.people ?? []).forEach((person, index) => {
      if (personIds.has(person.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['people', index, 'id'],
          message: `Duplicate person id ${person.id}`,
        });
      }
      personIds.add(person.id);
    });

    const circleIds = new Set<string>();
    const sourcesInCircles = new Map<string, string>();
    (config.circles ?? []).forEach((circle, index) => {
      if (circleIds.has(circle.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['circles', index, 'id'],
          message: `Duplicate circle id ${circle.id}`,
        });
      }
      circleIds.add(circle.id);
      circle.members.forEach((member) => {
        if (!personIds.has(member)) {
          ctx.addIssue({
            code: 'custom',
            path: ['circles', index, 'members'],
            message: `Circle ${circle.id}: unknown person ${member}`,
          });
        }
      });
      const source = config.sources.find((entry) => entry.id === circle.source);
      if (source === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['circles', index, 'source'],
          message: `Circle ${circle.id}: unknown source ${circle.source}`,
        });
      } else if (source.kind !== 'managed' || source.access !== 'write' || source.remote === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['circles', index, 'source'],
          message: `Circle ${circle.id}: source must be managed with access: write and a remote`,
        });
      }
      const existing = sourcesInCircles.get(circle.source);
      if (existing !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['circles', index, 'source'],
          message: `Circle ${circle.id}: source already belongs to ${existing}`,
        });
      }
      sourcesInCircles.set(circle.source, circle.id);
    });

    const scorerIds = new Set<string>();
    (config.scorers ?? []).forEach((scorer, index) => {
      if (scorerIds.has(scorer.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['scorers', index, 'id'],
          message: `Duplicate scorer id ${scorer.id}`,
        });
      }
      scorerIds.add(scorer.id);
      if (!isHttpsOrLoopback(scorer.endpoint)) {
        ctx.addIssue({
          code: 'custom',
          path: ['scorers', index, 'endpoint'],
          message: `Scorer ${scorer.id}: endpoint must be https, or http on loopback`,
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

      if (job.source !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['ingest', index, 'source'],
          message: `Ingest ${job.id}: use route instead of source. Each document is placed in a circle.`,
        });
      }

      if (!connectorIds.has(job.connector)) {
        ctx.addIssue({
          code: 'custom',
          path: ['ingest', index, 'connector'],
          message: `Ingest ${job.id}: unknown connector ${job.connector}`,
        });
      }

      const routeCircles = job.route.map((circleId) =>
        (config.circles ?? []).find((circle) => circle.id === circleId),
      );
      job.route.forEach((circleId, routeIndex) => {
        if (routeCircles[routeIndex] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['ingest', index, 'route', routeIndex],
            message: `Ingest ${job.id}: unknown circle ${circleId}`,
          });
        }
      });
      for (let routeIndex = 0; routeIndex < routeCircles.length - 1; routeIndex += 1) {
        const wider = routeCircles[routeIndex];
        const narrower = routeCircles[routeIndex + 1];
        if (wider === undefined || narrower === undefined) {
          continue;
        }
        if (!membersContain(wider.members, narrower.members)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ingest', index, 'route'],
            message: `Ingest ${job.id}: route must be a containment chain, widest first (${wider.id} must contain ${narrower.id})`,
          });
        }
      }

      if (job.score !== undefined) {
        if (!scorerIds.has(job.score.scorer)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ingest', index, 'score', 'scorer'],
            message: `Ingest ${job.id}: unknown scorer ${job.score.scorer}`,
          });
        }
        job.score.for.forEach((circleId) => {
          if (!job.route.includes(circleId)) {
            ctx.addIssue({
              code: 'custom',
              path: ['ingest', index, 'score', 'for'],
              message: `Ingest ${job.id}: score.for ${circleId} is not in the route`,
            });
          }
        });
      }

      if (!isRelativeTarget(job.target)) {
        ctx.addIssue({
          code: 'custom',
          path: ['ingest', index, 'target'],
          message: `Ingest ${job.id}: target must be a relative path inside the source`,
        });
      }
      for (const circle of routeCircles) {
        if (circle === undefined) {
          continue;
        }
        const targetKey = `${circle.source}:${normalizeTarget(job.target)}`;
        if (targets.has(targetKey)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ingest', index, 'target'],
            message: `Ingest ${job.id}: target is already owned by another job`,
          });
        }
        targets.add(targetKey);
      }
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
export type MachinePerson = z.infer<typeof machinePersonSchema>;
export type MachineCircle = z.infer<typeof machineCircleSchema>;
export type MachineScorer = z.infer<typeof machineScorerSchema>;
export type MachineIngest = z.infer<typeof machineIngestSchema>;
export type MachineConfig = z.infer<typeof machineConfigSchema>;
export type Device = z.infer<typeof deviceSchema>;
export type SensitivityLevel = z.infer<typeof sensitivityLevelSchema>;
export type DocumentAccess = z.infer<typeof documentAccessSchema>;

export function circleAdmit(circle: MachineCircle): 'auto' | 'review' {
  return circle.admit ?? 'review';
}

export function configPeople(config: MachineConfig): readonly MachinePerson[] {
  return config.people ?? [];
}

export function configCircles(config: MachineConfig): readonly MachineCircle[] {
  return config.circles ?? [];
}

export function configDomains(config: MachineConfig): readonly string[] {
  return config.domains ?? [];
}

export function circleById(config: MachineConfig, id: string): MachineCircle | undefined {
  return configCircles(config).find((circle) => circle.id === id);
}

export function ingestCircles(config: MachineConfig, job: MachineIngest): readonly MachineCircle[] {
  return job.route
    .map((id) => circleById(config, id))
    .filter((circle): circle is MachineCircle => circle !== undefined);
}

export function ingestSources(config: MachineConfig, job: MachineIngest): readonly MachineSource[] {
  return ingestCircles(config, job)
    .map((circle) => config.sources.find((source) => source.id === circle.source))
    .filter((source): source is MachineSource => source !== undefined);
}

export function ingestSourceForCircle(
  config: MachineConfig,
  job: MachineIngest,
  circleId: string,
): MachineSource | undefined {
  const circle = ingestCircles(config, job).find((entry) => entry.id === circleId);
  if (circle === undefined) {
    return undefined;
  }
  return config.sources.find((source) => source.id === circle.source);
}

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
