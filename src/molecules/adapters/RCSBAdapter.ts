import type { EntityId } from '@/simulation/types';
import type { StructureDescriptor, StructureProvider } from '../types';
import { structureRegistry } from '../StructureRegistry';

/** 향후 공급자 연동 경계. PDB 식별자는 확인을 거친 것만 쓴다. */
export class RCSBAdapter implements StructureProvider {
  readonly id = 'rcsb';
  async resolve(entityId: EntityId): Promise<StructureDescriptor> {
    return structureRegistry.resolve(entityId);
  }
}
