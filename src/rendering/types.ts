import type {
  DerivedSignals,
  EntityId,
  EntityLevels,
} from '@/simulation/types';

export type SimulationRendererKind = 'legacy-r3f' | 'molstar';
export type RendererLifecycleState =
  | 'idle'
  | 'checking-webgl'
  | 'initializing'
  | 'loading-structure'
  | 'ready'
  | 'context-lost'
  | 'error';

/** 렌더러가 엔진을 변경하지 않고 현재 장면을 그리는 데 필요한 읽기 전용 프레임. */
export interface SimulationRendererFrame {
  readonly time: number;
  readonly levels: EntityLevels;
  readonly signals: DerivedSignals;
  readonly reducedMotion: boolean;
}

/** WebGL 렌더러가 구현하는 계약. 렌더러 API를 엔진 쪽에 드러내지 않는다. */
export interface SimulationRendererAdapter {
  readonly kind: SimulationRendererKind;
  mount(target: HTMLElement, signal: AbortSignal): Promise<void>;
  updateFrame(frame: SimulationRendererFrame): void;
  selectEntity(entityId: EntityId | null): void;
  resetCamera(): void;
  dispose(): void;
}

export interface RendererFeatureFlags {
  readonly simulationRenderer: SimulationRendererKind;
}
