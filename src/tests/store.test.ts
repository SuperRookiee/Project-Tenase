/**
 * React 없이 구동하는 순수 스토어 동작.
 *
 * 스토어는 엔진 인스턴스 하나를 감싼 모듈 수준 싱글턴이므로, 모든 테스트가
 * `beforeEach`에서 알려진 기준 상태를 복원하며 실행 순서에 의존하지 않는다.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESET_ID,
  buildPresetConfig,
  type PresetId,
} from '@/presets/scenarios';
import { createInitialLevels } from '@/simulation/entities';
import type { EntityId } from '@/simulation/types';
import {
  getEngine,
  selectDisplayed,
  simulationStore,
} from '@/store/simulationStore';

const TRANSIENT_IDS: readonly EntityId[] = [
  'factorIXa',
  'tenaseComplex',
  'factorXa',
  'thrombin',
  'fibrin',
];

/** 편의 접근자. 스토어의 액션 묶음은 상태 객체에 들어 있다. */
function actions() {
  return simulationStore.getState();
}

/** 스토어의 공개 프레임 API를 통해 엔진을 앞으로 진행시킨다. */
function runFrames(count: number, delta = 0.1): void {
  actions().play();
  for (let index = 0; index < count; index += 1) {
    actions().advanceFrame(delta);
  }
  actions().publish();
}

beforeEach(() => {
  const store = simulationStore.getState();
  store.applyPreset(DEFAULT_PRESET_ID);
  store.pause();
  store.setScrubIndex(null);
  store.selectEntity('thrombin');
  store.setReducedMotion(false);
  store.setHoveredEntity(null);
  store.stopCameraStory();
});

describe('reset', () => {
  it('선택한 프리셋을 복원하고 슬라이더 수정은 모두 버린다', () => {
    actions().applyPreset('custom-sandbox');
    expect(simulationStore.getState().presetId).toBe('custom-sandbox');

    actions().setSupply('factorIX', 0.11);
    actions().setSupply('tfpi', 0.99);
    actions().setEntityEnabled('antithrombin', false);
    actions().setVesselDamageSignal(0.87);
    actions().setSimulationSpeed(0.9);
    actions().setParticleDensity(0.13);

    runFrames(12);
    actions().pause();
    expect(getEngine().getState().tick).toBeGreaterThan(0);

    actions().setScrubIndex(0);
    expect(simulationStore.getState().scrubIndex).not.toBeNull();

    actions().reset();

    const state = simulationStore.getState();
    const expected = buildPresetConfig('custom-sandbox');

    expect(state.presetId).toBe('custom-sandbox');
    expect(state.config).toEqual(expected);
    expect(state.scrubIndex).toBeNull();
    expect(state.frame.tick).toBe(0);
    expect(state.frame.time).toBe(0);
    expect(getEngine().getState().tick).toBe(0);
    expect(state.frame.levels).toEqual(createInitialLevels(expected.supply));

    for (const id of TRANSIENT_IDS) {
      expect(state.frame.levels[id], `${id}이(가) 0으로 돌아가지 않았다`).toBe(0);
    }
    expect(state.frame.events).toHaveLength(0);
  });

  it('발행된 이력을 비운다', () => {
    runFrames(30);
    expect(simulationStore.getState().frame.snapshots.length).toBeGreaterThan(1);

    actions().reset();
    expect(simulationStore.getState().frame.snapshots).toHaveLength(1);
    expect(simulationStore.getState().frame.snapshots[0]?.tick).toBe(0);
  });
});

describe('유효하지 않은 숫자 입력은 거부된다', () => {
  it('이전 공급값을 그대로 두고 예외도 던지지 않는다', () => {
    actions().setSupply('factorIX', 0.4);
    const before = simulationStore.getState().config.supply.factorIX;
    expect(before).toBe(0.4);

    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 'abc', '', null, undefined, {}, []]) {
      expect(() => actions().setSupply('factorIX', bad)).not.toThrow();
      expect(
        simulationStore.getState().config.supply.factorIX,
        `setSupply(${String(bad)}) 뒤에 supply.factorIX가 바뀌었다`,
      ).toBe(before);
    }
  });

  it('전역 파라미터를 그대로 둔다', () => {
    actions().setVesselDamageSignal(0.62);
    actions().setSimulationSpeed(0.31);
    actions().setParticleDensity(0.44);

    const before = simulationStore.getState().config;
    expect(before.vesselDamageSignal).toBe(0.62);
    expect(before.simulationSpeed).toBe(0.31);
    expect(before.particleDensity).toBe(0.44);

    expect(() => {
      actions().setVesselDamageSignal(Number.POSITIVE_INFINITY);
      actions().setVesselDamageSignal(Number.NaN);
      actions().setSimulationSpeed(null);
      actions().setSimulationSpeed('not a number');
      actions().setParticleDensity({});
      actions().setParticleDensity(Number.NEGATIVE_INFINITY);
    }).not.toThrow();

    const after = simulationStore.getState().config;
    expect(after.vesselDamageSignal).toBe(0.62);
    expect(after.simulationSpeed).toBe(0.31);
    expect(after.particleDensity).toBe(0.44);
  });

  it('숫자 문자열을 받아들이고 범위를 벗어난 유한값은 범위 제한한다', () => {
    actions().setSupply('factorIX', '0.25');
    expect(simulationStore.getState().config.supply.factorIX).toBe(0.25);

    actions().setSupply('factorIX', 5);
    expect(simulationStore.getState().config.supply.factorIX).toBe(1);

    actions().setSupply('factorIX', -5);
    expect(simulationStore.getState().config.supply.factorIX).toBe(0);
  });

  it('알 수 없는 엔티티 id를 무시한다', () => {
    const before = { ...simulationStore.getState().config.supply };

    expect(() => {
      actions().setSupply('notAnEntity' as EntityId, 0.5);
      actions().setEntityEnabled('alsoNotAnEntity' as EntityId, false);
    }).not.toThrow();

    expect(simulationStore.getState().config.supply).toEqual(before);
    expect(
      Object.prototype.hasOwnProperty.call(
        simulationStore.getState().config.supply,
        'notAnEntity',
      ),
    ).toBe(false);
  });

  it('불리언이 아닌 활성 플래그를 무시한다', () => {
    const before = simulationStore.getState().config.enabled.thrombin;
    actions().setEntityEnabled('thrombin', 'yes' as unknown as boolean);
    expect(simulationStore.getState().config.enabled.thrombin).toBe(before);
  });
});

describe('advanceFrame', () => {
  it('실행 중이고 실시간일 때 엔진을 진행시킨다', () => {
    actions().play();
    const before = getEngine().getState().tick;
    actions().advanceFrame(0.1);
    expect(getEngine().getState().tick).toBeGreaterThan(before);
  });

  it('일시 정지 중에는 아무것도 하지 않는다', () => {
    actions().pause();
    const before = getEngine().getState().tick;
    for (let index = 0; index < 10; index += 1) actions().advanceFrame(0.1);
    expect(getEngine().getState().tick).toBe(before);
  });

  it('타임라인을 되짚어 보는 동안에는 아무것도 하지 않는다', () => {
    runFrames(20);
    actions().setScrubIndex(3);
    expect(simulationStore.getState().scrubIndex).not.toBeNull();

    // 실행 플래그를 강제로 켜서, 진행을 막는 것이 스크러브 가드뿐이 되게 한다.
    simulationStore.setState({ running: true });
    const before = getEngine().getState().tick;
    for (let index = 0; index < 10; index += 1) actions().advanceFrame(0.1);
    expect(getEngine().getState().tick).toBe(before);
  });

  it('유한하지 않거나 0 이하인 델타를 무시한다', () => {
    actions().play();
    const before = getEngine().getState().tick;
    actions().advanceFrame(Number.NaN);
    actions().advanceFrame(Number.POSITIVE_INFINITY);
    actions().advanceFrame(0);
    actions().advanceFrame(-1);
    expect(getEngine().getState().tick).toBe(before);
  });
});

describe('실행 제어', () => {
  it('stepOnce는 정확히 한 틱만 진행하고 일시 정지한다', () => {
    actions().play();
    const before = getEngine().getState().tick;
    actions().stepOnce();

    expect(getEngine().getState().tick).toBe(before + 1);
    expect(simulationStore.getState().running).toBe(false);
    expect(simulationStore.getState().frame.tick).toBe(before + 1);
    expect(simulationStore.getState().scrubIndex).toBeNull();
  });

  it('toggleRunning은 실행 플래그를 양방향으로 뒤집는다', () => {
    actions().pause();
    expect(simulationStore.getState().running).toBe(false);
    actions().toggleRunning();
    expect(simulationStore.getState().running).toBe(true);
    actions().toggleRunning();
    expect(simulationStore.getState().running).toBe(false);
  });
});

describe('스크러빙', () => {
  it('범위를 벗어난 인덱스를 제한하고 실행을 일시 정지한다', () => {
    runFrames(30);
    const length = simulationStore.getState().frame.snapshots.length;
    expect(length).toBeGreaterThan(1);

    actions().play();
    actions().setScrubIndex(10_000);
    expect(simulationStore.getState().scrubIndex).toBe(length - 1);
    expect(simulationStore.getState().running).toBe(false);

    actions().play();
    actions().setScrubIndex(-25);
    expect(simulationStore.getState().scrubIndex).toBe(0);
    expect(simulationStore.getState().running).toBe(false);
  });

  it('소수 인덱스를 실제 스냅샷 위치로 반올림한다', () => {
    runFrames(30);
    actions().setScrubIndex(2.4);
    expect(simulationStore.getState().scrubIndex).toBe(2);
    actions().setScrubIndex(2.6);
    expect(simulationStore.getState().scrubIndex).toBe(3);
  });

  it('play()는 화면을 실시간 실행으로 되돌린다', () => {
    runFrames(30);
    actions().setScrubIndex(4);
    expect(simulationStore.getState().scrubIndex).toBe(4);

    actions().play();
    expect(simulationStore.getState().scrubIndex).toBeNull();
    expect(simulationStore.getState().running).toBe(true);
  });

  it('setScrubIndex(null)은 재개하지 않고 실시간 화면으로 돌아간다', () => {
    runFrames(30);
    actions().setScrubIndex(4);
    actions().setScrubIndex(null);
    expect(simulationStore.getState().scrubIndex).toBeNull();
    expect(simulationStore.getState().running).toBe(false);
  });

  it('selectDisplayed는 스크러빙 중일 때만 과거 값을 보고한다', () => {
    runFrames(30);
    expect(selectDisplayed(simulationStore.getState()).isHistorical).toBe(false);

    actions().setScrubIndex(1);
    const displayed = selectDisplayed(simulationStore.getState());
    expect(displayed.isHistorical).toBe(true);
    expect(displayed.tick).toBe(
      simulationStore.getState().frame.snapshots[1]?.tick,
    );

    actions().play();
    expect(selectDisplayed(simulationStore.getState()).isHistorical).toBe(false);
  });
});

describe('applyPreset', () => {
  it('프리셋 설정을 채택하고 실행을 다시 시작한다', () => {
    runFrames(20);
    expect(simulationStore.getState().frame.events.length).toBeGreaterThan(0);
    actions().applyPreset('increased-tfpi-inhibition');

    const state = simulationStore.getState();
    expect(state.presetId).toBe('increased-tfpi-inhibition');
    expect(state.config).toEqual(buildPresetConfig('increased-tfpi-inhibition'));
    expect(state.frame.tick).toBe(0);
    expect(state.scrubIndex).toBeNull();
    expect(state.frame.events).toHaveLength(0);
    expect(state.frame.snapshots).toHaveLength(1);
  });

  it('유효하지 않은 id를 무시한다', () => {
    actions().applyPreset('custom-sandbox');
    const before = simulationStore.getState();

    expect(() => {
      actions().applyPreset('not-a-preset' as PresetId);
      actions().applyPreset('' as PresetId);
      actions().applyPreset(null as unknown as PresetId);
      actions().applyPreset(undefined as unknown as PresetId);
    }).not.toThrow();

    const after = simulationStore.getState();
    expect(after.presetId).toBe(before.presetId);
    expect(after.config).toEqual(before.config);
  });
});

describe('선택과 플래그', () => {
  it('알려진 엔티티를 선택하고 null로 선택을 해제한다', () => {
    actions().selectEntity('factorXa');
    expect(simulationStore.getState().selectedEntityId).toBe('factorXa');

    actions().selectEntity(null);
    expect(simulationStore.getState().selectedEntityId).toBeNull();
  });

  it('알 수 없는 엔티티 id를 무시한다', () => {
    actions().selectEntity('thrombin');
    actions().selectEntity('nope' as EntityId);
    expect(simulationStore.getState().selectedEntityId).toBe('thrombin');
  });

  it('모션 줄이기 플래그와 WebGL 플래그를 불리언으로 변환한다', () => {
    actions().setReducedMotion(true);
    expect(simulationStore.getState().reducedMotion).toBe(true);
    actions().setReducedMotion('nope' as unknown as boolean);
    expect(simulationStore.getState().reducedMotion).toBe(false);

    actions().setWebglAvailable(true);
    expect(simulationStore.getState().webglAvailable).toBe(true);
    actions().setWebglAvailable(false);
    expect(simulationStore.getState().webglAvailable).toBe(false);
  });

  it('hover 상태를 검증하고 선택 상태와 분리해 유지한다', () => {
    actions().selectEntity('thrombin');
    actions().setHoveredEntity('factorXa');
    expect(simulationStore.getState().selectedEntityId).toBe('thrombin');
    expect(simulationStore.getState().hoveredEntityId).toBe('factorXa');

    actions().setHoveredEntity('unknown' as EntityId);
    expect(simulationStore.getState().hoveredEntityId).toBe('factorXa');
    actions().setHoveredEntity(null);
    expect(simulationStore.getState().hoveredEntityId).toBeNull();
  });

  it('카메라 스토리를 시작·종료하고 모션 줄이기에서는 차단한다', () => {
    actions().startCameraStory('fibrin');
    expect(simulationStore.getState().cameraStoryTarget).toBe('fibrin');
    actions().stopCameraStory();
    expect(simulationStore.getState().cameraStoryTarget).toBeNull();

    actions().startCameraStory('full');
    actions().setReducedMotion(true);
    expect(simulationStore.getState().cameraStoryTarget).toBeNull();
    actions().startCameraStory('thrombin');
    expect(simulationStore.getState().cameraStoryTarget).toBeNull();
  });
});
