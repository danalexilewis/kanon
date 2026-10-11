export type SensitivityLevel = 0 | 1 | 2 | 3;

export type AdmitMode = 'auto' | 'review';

export type SharingCompleteness = 'full' | 'partial';

export type PlacementBasis = 'sharing' | 'promotion';

export interface Person {
  readonly id: string;
  readonly google: readonly string[];
  readonly github?: string;
}

export interface Circle {
  readonly id: string;
  readonly source: string;
  readonly members: readonly string[];
  readonly ceiling: SensitivityLevel;
  readonly admit: AdmitMode;
}

export interface SharingGrant {
  readonly type: 'user' | 'group' | 'domain' | 'anyone';
  readonly emailAddress?: string;
  readonly domain?: string;
  readonly allowFileDiscovery?: boolean;
  readonly deleted?: boolean;
  readonly expirationTime?: string;
  readonly view?: string;
}

export interface SharingSnapshot {
  readonly grants: readonly SharingGrant[];
  readonly sharing: SharingCompleteness;
}

export interface Readers {
  readonly people: readonly string[];
  readonly others: number;
  readonly external: number;
  readonly groupUnresolved: number;
  readonly sharing: SharingCompleteness;
}

export interface ReviewState {
  readonly queued: ReadonlySet<string>;
  readonly excluded: boolean;
  readonly finalLevel?: SensitivityLevel;
  readonly proposedLevel?: SensitivityLevel;
  readonly approvals: Readonly<Record<string, ApprovalRecord>>;
}

export interface ApprovalRecord {
  readonly circle: string;
  readonly hash: string;
  readonly basis: PlacementBasis;
  readonly canShare: boolean;
  readonly added: readonly string[];
  readonly by: string;
  readonly note: string;
}

export interface PlacementInput {
  readonly route: readonly string[];
  readonly circles: readonly Circle[];
  readonly readers: Readers;
  readonly level: SensitivityLevel;
  readonly review: ReviewState;
  readonly contentHash: string;
  readonly canShare: boolean;
}

export interface Placement {
  readonly circle?: string;
  readonly held: boolean;
  readonly basis?: PlacementBasis;
  readonly level: SensitivityLevel;
  readonly reason?: string;
}
