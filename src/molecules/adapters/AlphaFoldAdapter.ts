import type { EntityId } from '@/simulation/types';
import type { StructureDescriptor, StructureProvider } from '../types';
import { structureRegistry } from '../StructureRegistry';

/** 향후 공급자 연동 경계. accession 대응은 의도적으로 추정하지 않는다. */
export class AlphaFoldAdapter implements StructureProvider {
  readonly id = 'alphafold';
  async resolve(entityId: EntityId): Promise<StructureDescriptor> {
    return structureRegistry.resolve(entityId);
  }
}
