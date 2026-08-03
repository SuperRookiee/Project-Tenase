import type { EntityId } from '@/simulation/types';
import { structureRegistry, type StructureRegistry } from './StructureRegistry';
import type { StructureDescriptor, StructureProvider } from './types';

/** 레지스트리를 그대로 읽는 resolver. 나중에 원격 공급자로 갈아 끼울 수 있도록 해석을 비동기로 둔다. */
export class RegistryStructureProvider implements StructureProvider {
  readonly id = 'registry';

  constructor(private readonly registry: StructureRegistry = structureRegistry) {}

  async resolve(entityId: EntityId, signal?: AbortSignal): Promise<StructureDescriptor> {
    signal?.throwIfAborted();
    return this.registry.resolve(entityId);
  }
}

/** 기존 import가 계속 동작하도록 남겨 둔 호환용 이름. */
export class LocalStructureProvider extends RegistryStructureProvider {}
