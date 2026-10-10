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

export const machineSourceSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['managed', 'local']),
    path: z.string().min(1),
    remote: z.string().optional(),
    branch: z.string().optional(),
  })
  .strict();

export const machineIndexSchema = z
  .object({
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
    sources: z.array(z.string().uuid()).min(1),
  })
  .strict();

export const machineProjectSchema = z
  .object({
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
    root: z.string().min(1),
  })
  .strict();

export const machineGrantSchema = z
  .object({
    project: z.string().min(1),
    indexes: z.array(z.string().min(1)),
  })
  .strict();

export const machineConfigSchema = z
  .object({
    schema: z.literal('kanon/machine/v1'),
    sources: z.array(machineSourceSchema),
    indexes: z.array(machineIndexSchema),
    projects: z.array(machineProjectSchema),
    grants: z.array(machineGrantSchema),
  })
  .strict();

export type SourceRoot = z.infer<typeof sourceRootSchema>;
export type SourceManifest = z.infer<typeof sourceManifestSchema>;
export type DocumentDoc = z.infer<typeof documentDocSchema>;
export type MachineSource = z.infer<typeof machineSourceSchema>;
export type MachineIndex = z.infer<typeof machineIndexSchema>;
export type MachineProject = z.infer<typeof machineProjectSchema>;
export type MachineGrant = z.infer<typeof machineGrantSchema>;
export type MachineConfig = z.infer<typeof machineConfigSchema>;

export function emptyMachineConfig(): MachineConfig {
  return {
    schema: 'kanon/machine/v1',
    sources: [],
    indexes: [],
    projects: [],
    grants: [],
  };
}
