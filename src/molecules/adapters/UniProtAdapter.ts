import type { EntityId } from '@/simulation/types';
import type { StructureDescriptor, StructureProvider } from '../types';
import { structureRegistry } from '../StructureRegistry';

/** 향후 메타데이터 연동 경계. UniProt accession은 확인을 거친 것만 쓴다. */
export class UniProtAdapter implements StructureProvider {
  readonly id = 'uniprot';
  async resolve(entityId: EntityId): Promise<StructureDescriptor> {
    return structureRegistry.resolve(entityId);
  }
}
