import { ENTITY_DEFINITIONS, ENTITY_KIND_LABELS, getEntity } from '@/simulation/entities';
import { reactionsInvolving } from '@/simulation/reactions';
import type { EntityId } from '@/simulation/types';
import { structureRegistry } from './StructureRegistry';
import type { MoleculeRecord } from './types';

export function getMoleculeRecord(entityId: EntityId): MoleculeRecord {
  const entity = getEntity(entityId);
  const structure = structureRegistry.resolve(entityId);
  const complexes = reactionsInvolving(entityId).map((reaction) => reaction.label);
  return {
    entityId,
    label: entity.label,
    summary: entity.role,
    domains: structure.domains ?? [],
    activeSites: structure.activeSites ?? [],
    functionalRegions: [
      `시뮬레이션 그래프에서 맡은 추상 역할: ${ENTITY_KIND_LABELS[entity.kind]}`,
    ],
    knownComplexes: complexes.length > 0 ? complexes : ['기록된 그래프 복합체가 없다'],
    structure,
  };
}

export const MOLECULE_RECORDS: readonly MoleculeRecord[] = ENTITY_DEFINITIONS.map(
  (entity) => getMoleculeRecord(entity.id),
);
