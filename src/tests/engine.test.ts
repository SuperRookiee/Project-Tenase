/**
 * 엔진 불변식.
 *
 * 엔진은 추상 반응 그래프 위에서 도는 결정론적 고정 스텝 적분기다. 엔진이
 * 내놓는 값은 모두 무차원이며 0–1 척도 안에 갇혀 있으므로, 이 테스트들은 특정
 * 수치 결과가 아니라 경계, 순서, 게이팅, 결정론성, 입력 검증에 집중한다.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_FRAME_DELTA_SECONDS,
  MAX_STEPS_PER_FRAME,
  createDefaultConfig,
  createEngine,
} from '@/simulation/engine';
import {
  ENTITY_IDS,
  createDefaultFlags,
  createLevels,
} from '@/simulation/entities';
import type {
  DerivedSignals,
  EntityFlags,
  EntityId,
  EntityLevels,
  SimulationConfig,
} from '@/simulation/types';

/**
 * 시드 기반 의사 난수 생성기(mulberry32). 엔진 자체에는 무작위성이 없고 이
 * 스위트도 그래야 한다. 불안정한 경계 검사는 아예 없느니만 못하다.
 */
function createTestRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0–1 척도 값인 `DerivedSignals` 필드 전부. */
const NORMALIZED_SIGNAL_KEYS = [
  'networkActivity',
  'activationIntensity',
  'inhibitionIntensity',
  'factorIXModelSignal',
  'factorXaModelSignal',
  'thrombinModelSignal',
  'fibrinModelSignal',
  'inhibitionModelSignal',
] as const satisfies ReadonlyArray<keyof DerivedSignals>;

/** 그래프가 순회하는 순서대로 나열한 추상 연쇄. */
const CASCADE_KEYS = [
  'factorIXModelSignal',
  'factorXaModelSignal',
  'thrombinModelSignal',
  'fibrinModelSignal',
] as const satisfies ReadonlyArray<keyof DerivedSignals>;

describe('무작위 설정 스윕에서의 정규화 경계', () => {
  it('모든 수준과 모든 척도 신호를 유한하게, 0–1 안에 유지한다', () => {
    const random = createTestRandom(0x7e_5a_9c_31);
    const violations: string[] = [];
    let stepsRun = 0;

    for (let run = 0; run < 60 && violations.length === 0; run += 1) {
      const supply = createLevels(0);
      const enabled = createDefaultFlags(true);
      for (const id of ENTITY_IDS) {
        supply[id] = random();
        // 이따금 노드를 꺼서 비활성 엣지까지 함께 다룬다.
        enabled[id] = random() > 0.15;
      }

      const config: SimulationConfig = {
        supply,
        enabled,
        vesselDamageSignal: random(),
        simulationSpeed: random(),
        particleDensity: random(),
      };
      const engine = createEngine(config);

      for (let step = 0; step < 400; step += 1) {
        engine.step();
        stepsRun += 1;
        const state = engine.getState();

        for (const id of ENTITY_IDS) {
          const level = state.levels[id];
          if (!Number.isFinite(level) || level < 0 || level > 1) {
            violations.push(
              `실행 ${run} 틱 ${state.tick}: 수준 ${id} = ${String(level)}`,
            );
          }
        }

        for (const key of NORMALIZED_SIGNAL_KEYS) {
          const value = state.signals[key];
          if (!Number.isFinite(value) || value < 0 || value > 1) {
            violations.push(
              `실행 ${run} 틱 ${state.tick}: 신호 ${key} = ${String(value)}`,
            );
          }
        }

        const count = state.signals.reactionEventCount;
        if (!Number.isInteger(count) || count < 0) {
          violations.push(
            `실행 ${run} 틱 ${state.tick}: reactionEventCount = ${String(count)}`,
          );
        }
      }
    }

    expect(stepsRun).toBeGreaterThanOrEqual(400);
    expect(
      violations,
      `범위를 벗어난 시뮬레이션 값:\n${violations.slice(0, 10).join('\n')}`,
    ).toEqual([]);
  });

  it('반응 이벤트 수를 소수로 내보내거나 줄어들게 하지 않는다', () => {
    const engine = createEngine(createDefaultConfig());
    let previous = 0;
    for (let step = 0; step < 1200; step += 1) {
      engine.step();
      const count = engine.getState().signals.reactionEventCount;
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
    expect(previous).toBeGreaterThan(0);
  });
});

describe('반응이 예상한 추상 신호를 갱신한다', () => {
  it('그래프 순서대로 연쇄를 따라 활동을 전파한다', () => {
    const engine = createEngine({
      ...createDefaultConfig(),
      vesselDamageSignal: 0.5,
    });

    const epsilon = 1e-6;
    const firstTick = new Map<keyof DerivedSignals, number>();

    for (let step = 0; step < 4000; step += 1) {
      engine.step();
      const state = engine.getState();
      for (const key of CASCADE_KEYS) {
        if (!firstTick.has(key) && state.signals[key] > epsilon) {
          firstTick.set(key, state.tick);
        }
      }
    }

    for (const key of CASCADE_KEYS) {
      expect(
        firstTick.get(key),
        `손상 신호가 열려 있는 동안 ${key}가 ${epsilon}을 넘어선 적이 없다`,
      ).toBeDefined();
      expect(engine.getState().signals[key]).toBeGreaterThan(0);
    }

    // 하류 신호는 상류가 시작된 뒤에야 시작될 수 있다.
    for (let index = 1; index < CASCADE_KEYS.length; index += 1) {
      const upstreamKey = CASCADE_KEYS[index - 1];
      const downstreamKey = CASCADE_KEYS[index];
      const upstream = firstTick.get(upstreamKey) ?? Number.NaN;
      const downstream = firstTick.get(downstreamKey) ?? Number.NaN;
      expect(
        downstream,
        `${downstreamKey}가 틱 ${downstream}에 활성화되어, 틱 ${upstream}의 상류 ${upstreamKey}보다 먼저 시작됐다`,
      ).toBeGreaterThanOrEqual(upstream);
    }
  });

  it('그래프가 돌기 시작하면 종합 활동 신호를 끌어올린다', () => {
    const engine = createEngine(createDefaultConfig());
    for (let step = 0; step < 1200; step += 1) engine.step();
    const { signals } = engine.getState();

    expect(signals.networkActivity).toBeGreaterThan(0);
    expect(signals.activationIntensity).toBeGreaterThan(0);
    expect(signals.inhibitionIntensity).toBeGreaterThan(0);
    expect(signals.reactionEventCount).toBeGreaterThan(0);

    // 차트에 그리는 억제 신호는 억제된 노드 자신의 회전량에 대한 비율이며,
    // 절대적인 억제성 처리량과는 의도적으로 구분된다.
    expect(signals.inhibitionModelSignal).toBeGreaterThan(0);
    expect(signals.inhibitionModelSignal).toBeLessThanOrEqual(1);
    expect(signals.inhibitionModelSignal).not.toBeCloseTo(
      signals.inhibitionIntensity,
      6,
    );
  });
});

describe('손상 게이팅', () => {
  it('손상 신호가 0인 동안에는 반응망 전체를 조용히 둔다', () => {
    const engine = createEngine({
      ...createDefaultConfig(),
      vesselDamageSignal: 0,
    });

    for (let step = 0; step < 3000; step += 1) engine.step();
    const state = engine.getState();

    const transientIds: readonly EntityId[] = [
      'factorIXa',
      'tenaseComplex',
      'factorXa',
      'thrombin',
      'fibrin',
    ];
    for (const id of transientIds) {
      expect(state.levels[id], `손상 신호가 없는데 ${id}이(가) 움직였다`).toBe(0);
    }

    for (const key of NORMALIZED_SIGNAL_KEYS) {
      expect(state.signals[key], `손상 신호가 없는데 ${key}이(가) 움직였다`).toBe(0);
    }

    expect(state.signals.reactionEventCount).toBe(0);
    expect(engine.getEvents()).toHaveLength(0);
    for (const activity of Object.values(state.reactionActivity)) {
      expect(activity).toBe(0);
    }
  });

  it('손상 신호가 열리는 즉시 반응망을 시작한다', () => {
    const engine = createEngine({
      ...createDefaultConfig(),
      vesselDamageSignal: 0,
    });
    for (let step = 0; step < 600; step += 1) engine.step();
    expect(engine.getState().signals.factorIXModelSignal).toBe(0);

    engine.configure({ vesselDamageSignal: 0.8 });
    for (let step = 0; step < 600; step += 1) engine.step();
    expect(engine.getState().signals.factorIXModelSignal).toBeGreaterThan(0);
    expect(engine.getState().signals.reactionEventCount).toBeGreaterThan(0);
  });
});

describe('엔티티를 끄면 그 엣지도 사라진다', () => {
  it('복합체를 0으로 떨어뜨리고 반응망 중간 신호를 낮게 붙들어 둔다', () => {
    const baseline = createEngine(createDefaultConfig());

    const disabledFlags: EntityFlags = {
      ...createDefaultFlags(true),
      factorVIIIa: false,
    };
    const disabled = createEngine({
      ...createDefaultConfig(),
      enabled: disabledFlags,
    });

    for (let step = 0; step < 3000; step += 1) {
      baseline.step();
      disabled.step();
    }

    const enabledState = baseline.getState();
    const disabledState = disabled.getState();

    expect(enabledState.levels.tenaseComplex).toBeGreaterThan(0.01);
    expect(disabledState.levels.tenaseComplex).toBeLessThan(1e-6);

    expect(enabledState.signals.factorXaModelSignal).toBeGreaterThan(0.01);
    expect(disabledState.signals.factorXaModelSignal).toBeLessThan(
      enabledState.signals.factorXaModelSignal / 100,
    );

    // 결합 엣지 자체가 조용한 정도가 아니라 완전히 멈춰 있다.
    expect(disabledState.reactionActivity['r2-binding']).toBe(0);
    expect(disabledState.levels.factorVIIIa).toBeLessThan(1e-6);
  });

  it('노드 하나를 꺼도 무관한 저장형 노드는 그대로 둔다', () => {
    const disabled = createEngine({
      ...createDefaultConfig(),
      enabled: { ...createDefaultFlags(true), factorVIIIa: false },
    });
    for (let step = 0; step < 600; step += 1) disabled.step();
    // Factor IX는 여전히 자신의 공급값 설정을 향해 이완한다.
    expect(disabled.getState().levels.factorIX).toBeGreaterThan(0);
  });
});

describe('결정론성', () => {
  it('동일한 입력에 대해 동일한 수준과 이벤트 id를 만든다', () => {
    const config = createDefaultConfig();
    const first = createEngine(config);
    const second = createEngine(config);

    for (let step = 0; step < 1500; step += 1) {
      first.step();
      second.step();
    }

    expect(second.getState().levels).toEqual(first.getState().levels);
    expect(second.getState().signals).toEqual(first.getState().signals);
    expect(second.getEvents().map((event) => event.id)).toEqual(
      first.getEvents().map((event) => event.id),
    );
    expect(first.getEvents().length).toBeGreaterThan(0);
  });

  it('리셋한 뒤에도 동일한 궤적으로 돌아온다', () => {
    const config = createDefaultConfig();
    const engine = createEngine(config);
    for (let step = 0; step < 300; step += 1) engine.step();
    const firstPass: EntityLevels = { ...engine.getState().levels };

    engine.reset(config);
    for (let step = 0; step < 300; step += 1) engine.step();

    expect(engine.getState().levels).toEqual(firstPass);
  });
});

describe('유효하지 않은 숫자 입력은 엔진 경계에서 거부된다', () => {
  it.each<[string, number]>([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('setSupply는 %s에 대해 RangeError를 던지고 설정을 그대로 둔다', (
    _label,
    value,
  ) => {
    const engine = createEngine(createDefaultConfig());
    const before = structuredClone(engine.getConfig());

    expect(() => engine.setSupply('factorIX', value)).toThrow(RangeError);
    expect(engine.getConfig()).toEqual(before);
  });

  it.each<[string, number]>([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('configure는 %s 손상 신호에 대해 RangeError를 던진다', (_label, value) => {
    const engine = createEngine(createDefaultConfig());
    const before = structuredClone(engine.getConfig());

    expect(() => engine.configure({ vesselDamageSignal: value })).toThrow(
      RangeError,
    );
    expect(engine.getConfig()).toEqual(before);
  });

  it('유효하지 않은 공급값 패치를 부분 적용 없이 거부한다', () => {
    const engine = createEngine(createDefaultConfig());
    const before = structuredClone(engine.getConfig());
    const badSupply = { factorX: Number.NaN } as unknown as EntityLevels;

    expect(() => engine.configure({ supply: badSupply })).toThrow(RangeError);
    expect(engine.getConfig()).toEqual(before);
  });

  it('범위를 벗어난 유한 공급값은 예외를 던지지 않고 범위 제한한다', () => {
    const engine = createEngine(createDefaultConfig());
    engine.setSupply('factorIX', 4);
    expect(engine.getConfig().supply.factorIX).toBe(1);
    engine.setSupply('factorIX', -4);
    expect(engine.getConfig().supply.factorIX).toBe(0);
  });
});

describe('advance', () => {
  it('속도가 0인 동안에는 0을 반환하고 스텝을 진행하지 않는다', () => {
    const engine = createEngine({
      ...createDefaultConfig(),
      simulationSpeed: 0,
    });
    const before = engine.getState().tick;

    expect(engine.advance(0.5)).toBe(0);
    expect(engine.advance(MAX_FRAME_DELTA_SECONDS)).toBe(0);
    expect(engine.getState().tick).toBe(before);
  });

  it('한 번의 호출에서 MAX_STEPS_PER_FRAME보다 많은 스텝을 실행하지 않는다', () => {
    const engine = createEngine({
      ...createDefaultConfig(),
      simulationSpeed: 1,
    });

    for (const delta of [0.25, 1, 10, 600]) {
      const before = engine.getState().tick;
      const steps = engine.advance(delta);
      expect(steps).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME);
      expect(engine.getState().tick - before).toBe(steps);
    }
  });

  it('유한하지 않거나 0 이하인 델타를 무시한다', () => {
    const engine = createEngine(createDefaultConfig());
    const before = engine.getState().tick;

    expect(engine.advance(Number.NaN)).toBe(0);
    expect(engine.advance(Number.POSITIVE_INFINITY)).toBe(0);
    expect(engine.advance(0)).toBe(0);
    expect(engine.advance(-1)).toBe(0);
    expect(engine.getState().tick).toBe(before);
  });

  it('속도가 0보다 크면 모델 시계를 진행시킨다', () => {
    const engine = createEngine(createDefaultConfig());
    const steps = engine.advance(0.1);
    expect(steps).toBeGreaterThan(0);
    expect(engine.getState().tick).toBe(steps);
    expect(engine.getState().time).toBeGreaterThan(0);
  });
});
