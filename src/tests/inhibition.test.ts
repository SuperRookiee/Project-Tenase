/**
 * 억제성 엣지는 자신이 가리키는 신호를 눌러 준다.
 *
 * 여기의 모든 비교는 *짝지은 실행*이다. 같은 설정으로 만든 두 엔진이 억제 노드
 * 공급값 하나만 다르게 두고 같은 횟수만큼 스텝을 밟는다. 엔진은 결정론적이므로
 * 두 실행의 차이는 모두 그 파라미터 하나에서 비롯된 것이다.
 */
import { describe, expect, it } from 'vitest';
import { createDefaultConfig, createEngine } from '@/simulation/engine';
import type {
  DerivedSignals,
  EntityId,
  SimulationEngine,
  SimulationState,
} from '@/simulation/types';

/** 그래프가 전개되기에는 충분하고, 구조 노드가 포화되기에는 못 미치는 길이. */
const STEPS = 600;

/** 단조성 검사에 쓰는 억제 노드 설정 사다리. */
const LADDER = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1] as const;

function runWithSupply(
  overrides: Partial<Record<EntityId, number>>,
  steps: number = STEPS,
): SimulationState {
  const base = createDefaultConfig();
  const supply = { ...base.supply };
  for (const [entityId, value] of Object.entries(overrides)) {
    if (typeof value === 'number') {
      supply[entityId as EntityId] = value;
    }
  }
  const engine: SimulationEngine = createEngine({ ...base, supply });
  for (let step = 0; step < steps; step += 1) engine.step();
  return engine.getState();
}

function ladderOf(
  entityId: EntityId,
  key: keyof DerivedSignals,
): readonly number[] {
  return LADDER.map((value) => {
    const overrides: Partial<Record<EntityId, number>> = {};
    overrides[entityId] = value;
    return runWithSupply(overrides).signals[key];
  });
}

function expectNonIncreasing(series: readonly number[], label: string): void {
  for (let index = 1; index < series.length; index += 1) {
    expect(
      series[index],
      `억제 노드가 ${LADDER[index - 1]}에서 ${LADDER[index]}로 오를 때 ${label}이(가) 증가했다: ${JSON.stringify(series)}`,
    ).toBeLessThanOrEqual(series[index - 1]);
  }
}

function expectNonDecreasing(series: readonly number[], label: string): void {
  for (let index = 1; index < series.length; index += 1) {
    expect(
      series[index],
      `억제 노드가 ${LADDER[index - 1]}에서 ${LADDER[index]}로 오를 때 ${label}이(가) 감소했다: ${JSON.stringify(series)}`,
    ).toBeGreaterThanOrEqual(series[index - 1]);
  }
}

describe('TFPI 모델 억제성 엣지', () => {
  it('반응망 중간과 하류 신호를 확실히 더 낮게 유지한다', () => {
    const low = runWithSupply({ tfpi: 0.05 }).signals;
    const high = runWithSupply({ tfpi: 0.95 }).signals;

    expect(
      high.factorXaModelSignal,
      '첫 번째 억제 노드를 높였을 때 Factor Xa 모델 신호가 올라가서는 안 된다',
    ).toBeLessThan(low.factorXaModelSignal);
    expect(high.thrombinModelSignal).toBeLessThan(low.thrombinModelSignal);
    expect(high.fibrinModelSignal).toBeLessThan(low.fibrinModelSignal);

    // 두 실행 모두 실제로 활동 중이다. 0과 0을 비교하는 것이 아니다.
    expect(low.factorXaModelSignal).toBeGreaterThan(0);
    expect(high.factorXaModelSignal).toBeGreaterThan(0);
  });

  it('사다리 전 구간에서 자신이 누르는 신호를 절대 올리지 않는다', () => {
    expectNonIncreasing(ladderOf('tfpi', 'factorXaModelSignal'), 'Factor Xa 모델 신호');
    expectNonIncreasing(ladderOf('tfpi', 'thrombinModelSignal'), 'thrombin 모델 신호');
    expectNonIncreasing(ladderOf('tfpi', 'fibrinModelSignal'), 'fibrin 모델 신호');
  });

  it('공급값이 0이면 멈춰 있고 그 위에서는 활동한다', () => {
    const none = runWithSupply({ tfpi: 0 });
    const some = runWithSupply({ tfpi: 0.45 });

    expect(none.reactionActivity['i1-inhibition']).toBe(0);
    expect(some.reactionActivity['i1-inhibition']).toBeGreaterThan(0);
  });
});

describe('antithrombin 모델 억제성 엣지', () => {
  it('출력 신호와 구조 신호를 확실히 더 낮게 유지한다', () => {
    const low = runWithSupply({ antithrombin: 0.05 }).signals;
    const high = runWithSupply({ antithrombin: 0.95 }).signals;

    expect(
      high.thrombinModelSignal,
      '두 번째 억제 노드를 높였을 때 thrombin 모델 신호가 올라가서는 안 된다',
    ).toBeLessThan(low.thrombinModelSignal);
    expect(high.fibrinModelSignal).toBeLessThan(low.fibrinModelSignal);

    expect(low.thrombinModelSignal).toBeGreaterThan(0);
    expect(high.thrombinModelSignal).toBeGreaterThan(0);
  });

  it('종합 억제 강도를 끌어올린다', () => {
    const low = runWithSupply({ antithrombin: 0.05 }).signals;
    const high = runWithSupply({ antithrombin: 0.95 }).signals;

    expect(
      high.inhibitionIntensity,
      '두 번째 억제 노드를 높이면 억제 강도가 올라가야 한다',
    ).toBeGreaterThan(low.inhibitionIntensity);
    expect(high.inhibitionModelSignal).toBeGreaterThan(low.inhibitionModelSignal);
  });

  it('자신이 누르는 신호를 절대 올리지 않고, 억제 강도를 절대 낮추지 않는다', () => {
    expectNonIncreasing(
      ladderOf('antithrombin', 'thrombinModelSignal'),
      'thrombin 모델 신호',
    );
    expectNonIncreasing(
      ladderOf('antithrombin', 'fibrinModelSignal'),
      'fibrin 모델 신호',
    );
    expectNonDecreasing(
      ladderOf('antithrombin', 'inhibitionIntensity'),
      '억제 강도',
    );
  });

  it('공급값이 0이면 멈춰 있고 그 위에서는 활동한다', () => {
    expect(runWithSupply({ antithrombin: 0 }).reactionActivity['i2-inhibition']).toBe(0);
    expect(
      runWithSupply({ antithrombin: 0.45 }).reactionActivity['i2-inhibition'],
    ).toBeGreaterThan(0);
  });
});

describe('억제 노드는 서로 독립적으로 작용한다', () => {
  it('두 억제 노드가 모두 높을 때 하류 신호가 가장 낮아진다', () => {
    const neither = runWithSupply({ tfpi: 0.05, antithrombin: 0.05 }).signals;
    const both = runWithSupply({ tfpi: 0.95, antithrombin: 0.95 }).signals;
    const tfpiOnly = runWithSupply({ tfpi: 0.95, antithrombin: 0.05 }).signals;
    const antithrombinOnly = runWithSupply({ tfpi: 0.05, antithrombin: 0.95 }).signals;

    expect(both.thrombinModelSignal).toBeLessThan(tfpiOnly.thrombinModelSignal);
    expect(both.thrombinModelSignal).toBeLessThan(
      antithrombinOnly.thrombinModelSignal,
    );
    expect(tfpiOnly.thrombinModelSignal).toBeLessThan(neither.thrombinModelSignal);
    expect(antithrombinOnly.thrombinModelSignal).toBeLessThan(
      neither.thrombinModelSignal,
    );
  });
});

describe('차트에 그리는 억제 모델 신호', () => {
  /**
   * 회귀 방지 가드.
   *
   * 이 신호의 예전 정의는 절대적인 억제성 유량을 썼는데, 첫 번째 억제 노드가
   * 올라가면 오히려 *떨어졌다*. 반응망 중간을 굶기면 두 번째 억제성 엣지가
   * 작용할 대상 풀이 무너져서, 억제는 올라갔는데도 전체 억제성 처리량은 내려간
   * 것이다. 반응망 전체 비율로 잡은 정의에는 또 다른 결함이 있었다. 종단
   * 구조 노드가 포화되어 분모에서 빠질 때마다 값이 튀었다.
   *
   * 지금 이 신호는 억제된 각 노드 자신의 회전량에 대한 비율이므로, 포화 여부와
   * 무관하게 모든 구간에서 두 억제 노드 어느 쪽을 올려도 함께 올라간다.
   */
  for (const steps of [300, 600, 1200] as const) {
    for (const inhibitor of ['tfpi', 'antithrombin'] as const) {
      it(`${steps} 스텝 뒤 ${inhibitor} 노드와 함께 올라간다`, () => {
        const series = LADDER.map((value) => {
          const overrides: Partial<Record<EntityId, number>> = {};
          overrides[inhibitor] = value;
          return runWithSupply(overrides, steps).signals.inhibitionModelSignal;
        });

        expectNonDecreasing(series, `${inhibitor}에 대한 inhibitionModelSignal`);
        expect(
          series[series.length - 1],
          `${inhibitor}를 사다리 전 구간에 걸쳐 올렸는데도 신호가 움직이지 않았다: ${JSON.stringify(series)}`,
        ).toBeGreaterThan(series[0]);
      });
    }
  }
});
