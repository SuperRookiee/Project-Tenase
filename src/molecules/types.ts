import type { EntityId } from '@/simulation/types';

export type StructureSource =
  | 'rcsb-pdb'
  | 'alphafold'
  | 'local'
  | 'representative'
  | 'unavailable';

export type StructureEvidence =
  | 'experimental'
  | 'predicted'
  | 'isolated-domain'
  | 'representative-homolog'
  | 'conceptual-fallback';

export interface StructureDescriptor {
  readonly moleculeId: EntityId;
  readonly displayName: string;
  readonly source: StructureSource;
  readonly evidence: StructureEvidence;
  readonly accession?: string;
  readonly format?: 'mmcif' | 'bcif' | 'pdb';
  /** 같은 출처에 있는, 확인을 거친 fixture. 임의의 URL은 여기서 절대 받지 않는다. */
  readonly localUrl?: `/structures/${string}`;
  readonly biologicalState?: string;
  readonly chains?: readonly string[];
  readonly domains?: readonly string[];
  readonly activeSites?: readonly string[];
  readonly notes: string;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly provenanceUrl?: `https://${string}`;
}

export interface MoleculeRecord {
  readonly entityId: EntityId;
  readonly label: string;
  readonly summary: string;
  readonly domains: readonly string[];
  readonly activeSites: readonly string[];
  readonly functionalRegions: readonly string[];
  readonly knownComplexes: readonly string[];
  readonly structure: StructureDescriptor;
}

export interface StructureProvider {
  readonly id: string;
  resolve(entityId: EntityId, signal?: AbortSignal): Promise<StructureDescriptor>;
}
