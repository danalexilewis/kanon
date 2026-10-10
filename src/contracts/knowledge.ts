import type { ContractDef } from '@eddy-works/never-rest/contract';
import { z } from 'zod';

export const searchModeSchema = z.enum(['lexical', 'semantic', 'hybrid']);

export const citationSchema = z.object({
  uri: z.string(),
  sourceId: z.string(),
  docId: z.string(),
  identity: z.enum(['stable', 'unstable_identity']),
  revision: z.object({
    gitCommit: z.string().optional(),
    contentHash: z.string(),
    generation: z.number().int(),
  }),
  path: z.string(),
  title: z.string().optional(),
});

export const searchHitSchema = citationSchema.extend({
  score: z.number(),
  mode: searchModeSchema,
  snippet: z.string().optional(),
  fromLine: z.number().int().optional(),
});

export const knowledgeContract = {
  search: {
    method: 'GET',
    path: '/search',
    query: z
      .object({
        query: z.string().min(1),
        index: z.string().min(1),
        mode: searchModeSchema.default('lexical'),
        limit: z.coerce.number().int().min(1).max(50).default(10),
      })
      .strict(),
    output: z.object({
      mode: searchModeSchema,
      hits: z.array(searchHitSchema),
    }),
    errors: { index_not_available: 404, qmd_unavailable: 503 },
    summary: 'Search an authorized index',
  },
  get: {
    method: 'GET',
    path: '/get',
    query: z
      .object({
        uri: z.string().min(1),
        index: z.string().min(1),
        fromLine: z.coerce.number().int().min(1).optional(),
        maxLines: z.coerce.number().int().min(1).optional(),
      })
      .strict(),
    output: citationSchema.extend({
      body: z.string(),
      liveHash: z.string(),
    }),
    errors: {
      index_not_available: 404,
      not_found: 404,
      citation_mismatch: 409,
      invalid_config: 400,
    },
    summary: 'Get a document from an authorized index',
  },
  status: {
    method: 'GET',
    path: '/status',
    output: z.object({
      indexes: z.array(
        z.object({
          id: z.string(),
          generation: z.number().int().optional(),
          documents: z.number().int().optional(),
        }),
      ),
    }),
    errors: {},
    summary: 'Index status visible to the caller',
  },
  listIndexes: {
    method: 'GET',
    path: '/indexes',
    output: z.object({
      indexes: z.array(z.string()),
    }),
    errors: {},
    summary: 'List indexes the caller may use',
  },
} satisfies ContractDef;
