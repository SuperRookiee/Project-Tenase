import type { EntityId } from '@/simulation/types';

export type SimulationRendererKind = 'legacy-r3f' | 'molstar';
export type RendererLifecycleState =
  | 'idle'
  | 'checking-webgl'
  | 'initializing'
  | 'loading-structure'
  | 'ready'
  | 'context-lost'
  | 'error';

/** WebGL 렌더러가 구현하는 계약. 렌더러 API를 엔진 쪽에 드러내지 않는다. */
export interface SimulationRendererAdapter {
  readonly kind: SimulationRendererKind;
  mount(target: HTMLElement, signal: AbortSignal): Promise<void>;
  selectEntity(entityId: EntityId | null): void;
  dispose(): void;
}

export interface RendererFeatureFlags {
  readonly simulationRenderer: SimulationRendererKind;
}
