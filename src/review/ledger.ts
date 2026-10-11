import { z } from 'zod';

import type { ApprovalRecord, PlacementBasis, ReviewState, SensitivityLevel } from '../circles/types.js';

export const reviewEntryKindSchema = z.enum([
  'queue',
  'proposal',
  'level',
  'approval',
  'revoke',
  'exclude',
  'include',
]);

const levelSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const reviewEntrySchema = z
  .object({
    schema: z.literal('kanon/review/v1'),
    kind: reviewEntryKindSchema,
    uri: z.string().min(1),
    at: z.string().min(1),
    by: z.string().min(1),
    note: z.string().optional(),
    hash: z.string().min(1).optional(),
    circle: z.string().min(1).optional(),
    level: levelSchema.optional(),
    basis: z.enum(['sharing', 'promotion']).optional(),
    canShare: z.boolean().optional(),
    added: z.array(z.string().min(1)).optional(),
    proposedLevel: levelSchema.optional(),
    dimensions: z.record(z.string(), levelSchema).optional(),
    reasons: z.array(z.string().max(200)).max(3).optional(),
  })
  .strict();

export type ReviewEntry = z.infer<typeof reviewEntrySchema>;

export interface LedgerDocumentState extends ReviewState {
  readonly uri: string;
  readonly proposals: readonly ReviewEntry[];
}

export type LedgerState = Readonly<Record<string, LedgerDocumentState>>;

function emptyDoc(uri: string): LedgerDocumentState {
  return { uri, queued: new Set(), excluded: false, approvals: {}, proposals: [] };
}

function cloneDoc(state: LedgerDocumentState): {
  uri: string;
  queued: Set<string>;
  excluded: boolean;
  finalLevel?: SensitivityLevel;
  proposedLevel?: SensitivityLevel;
  approvals: Record<string, ApprovalRecord>;
  proposals: ReviewEntry[];
} {
  return {
    ...state,
    queued: new Set(state.queued),
    approvals: { ...state.approvals },
    proposals: [...state.proposals],
  };
}

function applyEntry(state: LedgerDocumentState, entry: ReviewEntry): LedgerDocumentState {
  const next = cloneDoc(state);
  switch (entry.kind) {
    case 'queue':
      if (entry.circle !== undefined) {
        next.queued.add(entry.circle);
      }
      return next;
    case 'proposal':
      return {
        ...next,
        proposedLevel:
          entry.proposedLevel !== undefined &&
          (next.proposedLevel === undefined || entry.proposedLevel > next.proposedLevel)
            ? entry.proposedLevel
            : next.proposedLevel,
        proposals: [...next.proposals, entry],
      };
    case 'level':
      return { ...next, finalLevel: entry.level as SensitivityLevel | undefined };
    case 'approval':
      if (entry.circle === undefined || entry.hash === undefined || entry.basis === undefined) {
        return next;
      }
      next.queued.delete(entry.circle);
      return {
        ...next,
        approvals: {
          ...next.approvals,
          [entry.circle]: {
            circle: entry.circle,
            hash: entry.hash,
            basis: entry.basis as PlacementBasis,
            canShare: entry.canShare === true,
            added: entry.added ?? [],
            by: entry.by,
            note: entry.note ?? '',
          } satisfies ApprovalRecord,
        },
      };
    case 'revoke':
      if (entry.circle !== undefined) {
        const { [entry.circle]: _removed, ...rest } = next.approvals;
        return { ...next, approvals: rest, queued: new Set([...next.queued].filter((id) => id !== entry.circle)) };
      }
      return { ...next, approvals: {}, queued: new Set() };
    case 'exclude':
      return { ...next, excluded: true };
    case 'include':
      return { ...next, excluded: false };
    default:
      return next;
  }
}

/**
 * Fold a JSONL ledger into per-URI state. Parse errors name the line.
 */
export function reduceLedger(lines: readonly string[]): { readonly state: LedgerState; readonly errors: readonly string[] } {
  const state: Record<string, LedgerDocumentState> = {};
  const errors: string[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '') {
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      errors.push(`line ${index + 1}: not JSON`);
      return;
    }
    const parsed = reviewEntrySchema.safeParse(value);
    if (!parsed.success) {
      errors.push(`line ${index + 1}: ${parsed.error.issues[0]?.message ?? 'invalid entry'}`);
      return;
    }
    const current = state[parsed.data.uri] ?? emptyDoc(parsed.data.uri);
    state[parsed.data.uri] = applyEntry(current, parsed.data);
  });
  return { state, errors };
}

export function documentState(state: LedgerState, uri: string): LedgerDocumentState {
  return state[uri] ?? emptyDoc(uri);
}
