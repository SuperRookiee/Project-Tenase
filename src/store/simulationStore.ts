/**
 * 메모리 상주 시뮬레이션 스토어.
 *
 * 상태 정책
 * ---------
 * 모든 상태는 페이지가 살아 있는 동안 메모리에만 존재한다. 이 모듈은
 * localStorage, sessionStorage, 쿠키, IndexedDB, URL 질의 문자열, 네트워크를
 * 절대 건드리지 않는다. 페이지를 새로 고치면 새 실행이 시작되며, 이는 의도된
 * 설계다.
 *
 * 성능 정책
 * ---------
 * 엔진은 애니메이션 프레임 주기로 진행하지만 React 상태는 그보다 훨씬 낮은
 * 빈도로 발행된다. 3D 레이어는 `getEngine()`을 통해 자신의 렌더 루프 안에서
 * 엔진의 실시간 상태를 직접 읽고, 나머지는 모두 발행 빈도가 조절된 `frame`
 * 슬라이스를 구독한다.
 */
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import {
  DEFAULT_PRESET_ID,
  buildPresetConfig,
  isPresetId,
  type PresetId,
} from '@/presets/scenarios';
import { createEngine } from '@/simulation/engine';
import { isEntityId } from '@/simulation/entities';
import { parseNormalized } from '@/simulation/numeric';
import { clampSnapshotIndex } from '@/simulation/snapshots';
import type {
  DerivedSignals,
  EntityId,
  EntityLevels,
  ReactionEvent,
  SimulationConfig,
  SimulationEngine,
  SimulationSnapshot,
} from '@/simulation/types';

/** React 쪽 상태는 프레임마다가 아니라 이 주기로 갱신된다. */
export const PUBLISH_INTERVAL_SECONDS = 1 / 12;

export type CameraStoryTarget = EntityId | 'full' | null;
export type WorkspaceId =
  | 'simulation'
  | 'scenarios'
  | 'parameters'
  | 'reactions'
  | 'molecules'
  | 'knowledge';

const WORKSPACE_IDS: readonly WorkspaceId[] = [
  'simulation',
  'scenarios',
  'parameters',
  'reactions',
  'molecules',
  'knowledge',
];

export interface PublishedFrame {
  readonly tick: number;
  readonly time: number;
  readonly levels: EntityLevels;
  readonly signals: DerivedSignals;
  readonly reactionActivity: Readonly<Record<string, number>>;
  readonly snapshots: readonly SimulationSnapshot[];
  readonly events: readonly ReactionEvent[];
}

export interface SimulationStoreState {
  readonly workspace: WorkspaceId;
  readonly config: SimulationConfig;
  readonly presetId: PresetId;
  readonly running: boolean;
  readonly reducedMotion: boolean;
  /** 캔버스가 WebGL 사용 가능 여부를 알려 주기 전까지는 `null`이다. */
  readonly webglAvailable: boolean | null;
  readonly selectedEntityId: EntityId | null;
  readonly hoveredEntityId: EntityId | null;
  readonly cameraStoryTarget: CameraStoryTarget;
  /** `null`은 "실시간 실행을 따라간다"는 뜻이고, 숫자는 이력을 살펴보는 중이라는 뜻이다. */
  readonly scrubIndex: number | null;
  readonly frame: PublishedFrame;

  setSupply(id: EntityId, value: unknown): void;
  setEntityEnabled(id: EntityId, enabled: boolean): void;
  setVesselDamageSignal(value: unknown): void;
  setSimulationSpeed(value: unknown): void;
  setParticleDensity(value: unknown): void;

  applyPreset(id: PresetId): void;
  reset(): void;

  play(): void;
  pause(): void;
  toggleRunning(): void;
  stepOnce(): void;

  selectEntity(id: EntityId | null): void;
  setWorkspace(workspace: WorkspaceId): void;
  openMoleculeExplorer(id: EntityId): void;
  setHoveredEntity(id: EntityId | null): void;
  startCameraStory(target?: Exclude<CameraStoryTarget, null>): void;
  stopCameraStory(): void;
  setScrubIndex(index: number | null): void;
  setReducedMotion(value: boolean): void;
  setWebglAvailable(value: boolean): void;

  /** 실제 시계 델타만큼 엔진을 진행시킨다. 시계 훅이 호출한다. */
  advanceFrame(deltaSeconds: number): void;
  /** 발행된 React 프레임을 강제로 갱신한다. */
  publish(): void;
}

const engine: SimulationEngine = createEngine(buildPresetConfig(DEFAULT_PRESET_ID));

/** 렌더 루프를 위한 엔진 직접 접근. 반응형이 아니다. */
export function getEngine(): SimulationEngine {
  return engine;
}

function captureFrame(): PublishedFrame {
  const state = engine.getState();
  return {
    tick: state.tick,
    time: state.time,
    // 엔진은 수준 레코드를 제자리에서 변경하므로, 보관하기 전에 복사한다.
    levels: { ...state.levels },
    signals: { ...state.signals },
    reactionActivity: { ...state.reactionActivity },
    snapshots: engine.getSnapshots(),
    events: engine.getEvents(),
  };
}

/** 발행 조절 값은 반응형 상태 바깥에 두어 절대 렌더를 유발하지 않게 한다. */
let publishAccumulator = 0;

export const simulationStore = createStore<SimulationStoreState>()((set, get) => ({
  workspace: 'simulation',
  config: engine.getConfig(),
  presetId: DEFAULT_PRESET_ID,
  running: true,
  reducedMotion: false,
  webglAvailable: null,
  selectedEntityId: 'thrombin',
  hoveredEntityId: null,
  cameraStoryTarget: null,
  scrubIndex: null,
  frame: captureFrame(),

  setSupply(id, value) {
    if (!isEntityId(id)) return;
    const parsed = parseNormalized(value);
    // 잘못된 입력은 기본값으로 강제 변환하지 않고 그대로 거부한다.
    if (parsed === null) return;
    engine.setSupply(id, parsed);
    set({ config: engine.getConfig() });
  },

  setEntityEnabled(id, enabled) {
    if (!isEntityId(id) || typeof enabled !== 'boolean') return;
    engine.setEnabled(id, enabled);
    set({ config: engine.getConfig() });
  },

  setVesselDamageSignal(value) {
    const parsed = parseNormalized(value);
    if (parsed === null) return;
    engine.configure({ vesselDamageSignal: parsed });
    set({ config: engine.getConfig() });
  },

  setSimulationSpeed(value) {
    const parsed = parseNormalized(value);
    if (parsed === null) return;
    engine.configure({ simulationSpeed: parsed });
    set({ config: engine.getConfig() });
  },

  setParticleDensity(value) {
    const parsed = parseNormalized(value);
    if (parsed === null) return;
    engine.configure({ particleDensity: parsed });
    set({ config: engine.getConfig() });
  },

  applyPreset(id) {
    if (!isPresetId(id)) return;
    engine.reset(buildPresetConfig(id));
    publishAccumulator = 0;
    set({
      presetId: id,
      config: engine.getConfig(),
      scrubIndex: null,
      hoveredEntityId: null,
      cameraStoryTarget: null,
      frame: captureFrame(),
    });
  },

  reset() {
    // 초기화는 항상 선택된 프리셋으로 되돌아가며, 슬라이더 수정값은 버린다.
    engine.reset(buildPresetConfig(get().presetId));
    publishAccumulator = 0;
    set({
      config: engine.getConfig(),
      scrubIndex: null,
      hoveredEntityId: null,
      cameraStoryTarget: null,
      frame: captureFrame(),
    });
  },

  play() {
    // 타임라인 스크러버에서 빠져나오면 뷰가 실시간 실행으로 돌아간다.
    set({ running: true, scrubIndex: null });
  },

  pause() {
    set({ running: false, frame: captureFrame() });
  },

  toggleRunning() {
    if (get().running) {
      get().pause();
    } else {
      get().play();
    }
  },

  stepOnce() {
    engine.step();
    set({ running: false, scrubIndex: null, frame: captureFrame() });
  },

  selectEntity(id) {
    if (id !== null && !isEntityId(id)) return;
    set({ selectedEntityId: id });
  },

  setWorkspace(workspace) {
    if (!WORKSPACE_IDS.includes(workspace)) return;
    set({ workspace });
  },

  openMoleculeExplorer(id) {
    if (!isEntityId(id)) return;
    set({ selectedEntityId: id, workspace: 'molecules', hoveredEntityId: null });
  },

  setHoveredEntity(id) {
    if (id !== null && !isEntityId(id)) return;
    set({ hoveredEntityId: id });
  },

  startCameraStory(target = 'full') {
    if (get().reducedMotion) return;
    if (target !== 'full' && !isEntityId(target)) return;
    set({ cameraStoryTarget: target });
  },

  stopCameraStory() {
    set({ cameraStoryTarget: null });
  },

  setScrubIndex(index) {
    if (index === null) {
      set({ scrubIndex: null });
      return;
    }
    const snapshots = get().frame.snapshots;
    const clamped = clampSnapshotIndex(index, snapshots.length);
    // 이력을 살펴보는 동안에는 실행을 멈춰, 보고 있는 화면이 밑에서 흘러가지 않게 한다.
    set({ scrubIndex: clamped, running: clamped === null ? get().running : false });
  },

  setReducedMotion(value) {
    const reducedMotion = value === true;
    set({
      reducedMotion,
      cameraStoryTarget: reducedMotion ? null : get().cameraStoryTarget,
    });
  },

  setWebglAvailable(value) {
    set({ webglAvailable: value === true });
  },

  advanceFrame(deltaSeconds) {
    const state = get();
    if (!state.running || state.scrubIndex !== null) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

    const steps = engine.advance(deltaSeconds);
    if (steps === 0) return;

    publishAccumulator += deltaSeconds;
    if (publishAccumulator >= PUBLISH_INTERVAL_SECONDS) {
      publishAccumulator = 0;
      set({ frame: captureFrame() });
    }
  },

  publish() {
    publishAccumulator = 0;
    set({ frame: captureFrame() });
  },
}));

/** React 바인딩. 항상 셀렉터와 함께 호출한다. */
export function useSimulationStore<T>(
  selector: (state: SimulationStoreState) => T,
): T {
  return useStore(simulationStore, selector);
}

/**
 * UI가 표시해야 할 수준과 신호. 평소에는 실시간 프레임이고, 타임라인을 살펴보는
 * 중이라면 스크러브한 스냅샷이다.
 */
export function selectDisplayed(state: SimulationStoreState): {
  levels: EntityLevels;
  signals: DerivedSignals;
  reactionActivity: Readonly<Record<string, number>>;
  tick: number;
  time: number;
  isHistorical: boolean;
} {
  if (state.scrubIndex !== null) {
    const snapshot = state.frame.snapshots[state.scrubIndex];
    if (snapshot) {
      return {
        levels: snapshot.levels,
        signals: snapshot.signals,
        reactionActivity: snapshot.reactionActivity,
        tick: snapshot.tick,
        time: snapshot.time,
        isHistorical: true,
      };
    }
  }
  return {
    levels: state.frame.levels,
    signals: state.frame.signals,
    reactionActivity: state.frame.reactionActivity,
    tick: state.frame.tick,
    time: state.frame.time,
    isHistorical: false,
  };
}
