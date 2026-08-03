import type { EntityId } from '@/simulation/types';
import type { StructureDescriptor } from '@/molecules/types';

export type RepresentationMode = 'conceptual' | 'cartoon' | 'surface' | 'ball-and-stick';
export type RepresentationLod = 0 | 1 | 2 | 3;

export interface RepresentationPolicy {
  readonly mode: RepresentationMode;
  readonly lod: RepresentationLod;
  readonly detailCost: number;
}

const POLICIES: Readonly<Record<RepresentationMode, RepresentationPolicy>> = {
  conceptual: { mode: 'conceptual', lod: 0, detailCost: 0 },
  cartoon: { mode: 'cartoon', lod: 1, detailCost: 1 },
  surface: { mode: 'surface', lod: 2, detailCost: 3 },
  'ball-and-stick': { mode: 'ball-and-stick', lod: 3, detailCost: 4 },
};

/** Phase 2 표현 정책. 비용이 큰 모드는 이후 작업공간을 위해 상한을 유지한다. */
export class SimulationRepresentationRegistry {
  readonly maxDetailedStructures = 2;

  resolve(descriptor: StructureDescriptor, selected: boolean): RepresentationPolicy {
    if (descriptor.evidence === 'conceptual-fallback') return POLICIES.conceptual;
    return selected ? POLICIES['ball-and-stick'] : POLICIES.cartoon;
  }

  capDetailed(entityIds: readonly EntityId[]): readonly EntityId[] {
    return entityIds.slice(0, this.maxDetailedStructures);
  }
}

export const simulationRepresentationRegistry = new SimulationRepresentationRegistry();
