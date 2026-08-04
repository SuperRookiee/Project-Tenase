/**
 * 시나리오 일괄 실행기의 불변식.
 *
 * 실행기는 결정론적 엔진을 여러 설정으로 돌려 결과를 나란히 놓는 도구다. 그래서
 * 이 테스트들은 특정 수치가 아니라 결정론성, 범위, 단조성, 그리고 외부 입력이
 * 실제로 그래프를 움직이는지에 집중한다. 곡선 모양을 못으로 박아 두면 조정 상수를
 * 조금만 손봐도 무너지므로 그런 검사는 두지 않는다.
 */
import { describe, expect, it } from 'vitest';
import {
  REFERENCE_FACTOR_SUPPLY,
  STRUCTURE_THRESHOLD,
  SUSTAINED_RATE,
  SWEEP_STEPS,
  runFactorSweep,
  runInputSweep,
  runScenario,
  structureRatio,
  type ScenarioSpec,
} from '@/simulation/scenarioSweep';
import { createDefaultConfig, createEngine } from '@/simulation/engine';

const BASE: Omit<ScenarioSpec, 'factorSupply' | 'externalInput'> = {
  duration: 12,
  damageSignal: 0.5,
};

function scenario(overrides: Partial<ScenarioSpec> = {}): ScenarioSpec {
  return { ...BASE, factorSupply: 0.6, externalInput: null, ...overrides };
}

describe('엔진 외부 입력', () => {
  it('현재 수준에 더하고 척도 위쪽에서 잘라 낸다', () => {
    const engine = createEngine(createDefaultConfig());
    engine.applyInput('thrombin', 0.4);
    expect(engine.getState().levels.thrombin).toBeCloseTo(0.4, 10);
    engine.applyInput('thrombin', 0.9);
    expect(engine.getState().levels.thrombin).toBe(1);
  });

  it('범위 밖 세기는 범위 제한하고 비유한값만 거부한다', () => {
    // 프로젝트 공통 규약을 따른다 — 슬라이더가 자기 경계값을 보고하는 것은 정상이므로
    // 범위를 벗어난 유한값은 잘라 내고, 상위 결함을 감추지 않도록 NaN·무한대는 던진다.
    const engine = createEngine(createDefaultConfig());
    engine.applyInput('thrombin', 1.4);
    expect(engine.getState().levels.thrombin).toBe(1);
    engine.applyInput('factorIXa', -0.2);
    expect(engine.getState().levels.factorIXa).toBe(0);
    expect(() => engine.applyInput('thrombin', Number.NaN)).toThrow(RangeError);
    expect(() => engine.applyInput('thrombin', Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('공급 설정값이 아니라 수준만 건드린다', () => {
    const engine = createEngine(createDefaultConfig());
    const before = engine.getConfig().supply.factorIX;
    engine.applyInput('factorIX', 0.2);
    expect(engine.getConfig().supply.factorIX).toBe(before);
  });
});

describe('시나리오 실행', () => {
  it('같은 명세는 언제나 같은 결과를 낸다', () => {
    const spec = scenario({
      externalInput: { targetId: 'thrombin', amount: 0.3, mode: 'pulse', atTime: 2 },
    });
    expect(runScenario(spec)).toEqual(runScenario(spec));
  });

  it('모든 표본과 요약값을 0–1 안에 둔다', () => {
    const run = runScenario(
      scenario({
        factorSupply: 1,
        externalInput: { targetId: 'thrombin', amount: 1, mode: 'sustained', atTime: 0 },
      }),
    );
    for (const sample of run.samples) {
      for (const key of ['factorIXa', 'factorXa', 'thrombin', 'fibrin'] as const) {
        expect(sample[key]).toBeGreaterThanOrEqual(0);
        expect(sample[key]).toBeLessThanOrEqual(1);
      }
    }
    const { peakThrombin, thrombinIntegral, finalFibrin } = run.outcome;
    for (const value of [peakThrombin, thrombinIntegral, finalFibrin]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('관찰 창을 벗어나지 않는 표본을 시간 순으로 담는다', () => {
    const run = runScenario(scenario());
    expect(run.samples.length).toBeGreaterThan(1);
    expect(run.samples[0].time).toBe(0);
    expect(run.samples[run.samples.length - 1].time).toBeCloseTo(BASE.duration, 6);
    for (let index = 1; index < run.samples.length; index += 1) {
      expect(run.samples[index].time).toBeGreaterThan(run.samples[index - 1].time);
    }
  });

  it('개시 노드가 비어 있으면 하류가 전혀 켜지지 않는다', () => {
    const run = runScenario(scenario({ factorSupply: 0 }));
    expect(run.outcome.peakThrombin).toBe(0);
    expect(run.outcome.finalFibrin).toBe(0);
    expect(run.outcome.timeToThreshold).toBeNull();
  });

  it('손상 신호가 0이면 개시 엣지가 닫힌 채로 있는다', () => {
    const run = runScenario(scenario({ factorSupply: 1, damageSignal: 0 }));
    expect(run.outcome.peakThrombin).toBe(0);
    expect(run.outcome.finalFibrin).toBe(0);
  });

  it('기준선 도달 시각을 실제로 넘어선 시점으로 보고한다', () => {
    const run = runScenario(scenario({ factorSupply: 1, duration: 40 }));
    const { timeToThreshold } = run.outcome;
    expect(timeToThreshold).not.toBeNull();
    const crossing = run.samples.find((sample) => sample.fibrin >= STRUCTURE_THRESHOLD);
    expect(crossing).toBeDefined();
    // 표본은 솎아 낸 것이라 스텝 단위 시각보다 뒤일 수 있어도 앞설 수는 없다.
    expect(timeToThreshold as number).toBeLessThanOrEqual((crossing as { time: number }).time);
  });

  it('입력 시각 이전에는 아무것도 바꾸지 않는다', () => {
    const plain = runScenario(scenario({ factorSupply: 0.2 }));
    const pushed = runScenario(
      scenario({
        factorSupply: 0.2,
        externalInput: { targetId: 'thrombin', amount: 0.5, mode: 'pulse', atTime: 6 },
      }),
    );
    plain.samples
      .filter((sample) => sample.time < 6)
      .forEach((sample, index) => {
        expect(pushed.samples[index].thrombin).toBeCloseTo(sample.thrombin, 10);
      });
    expect(pushed.outcome.finalFibrin).toBeGreaterThan(plain.outcome.finalFibrin);
  });

  it('세기가 0인 입력은 입력하지 않은 것과 같다', () => {
    const none = runScenario(scenario({ factorSupply: 0.3 }));
    for (const mode of ['pulse', 'sustained'] as const) {
      const zero = runScenario(
        scenario({
          factorSupply: 0.3,
          externalInput: { targetId: 'thrombin', amount: 0, mode, atTime: 1 },
        }),
      );
      expect(zero.outcome).toEqual(none.outcome);
    }
  });

  it('지속 입력 주입률을 상수로 붙들어 둔다', () => {
    // 이 값이 커지면 곡선이 낮은 세기에서 곧바로 포화해 쓸어보기가 무의미해진다.
    expect(SUSTAINED_RATE).toBeGreaterThan(0);
    expect(SUSTAINED_RATE).toBeLessThanOrEqual(1);
  });
});

describe('쓸어보기', () => {
  it('개시 노드 공급값을 올리면 종단 노드가 줄지 않는다', () => {
    const points = runFactorSweep(BASE);
    expect(points).toHaveLength(SWEEP_STEPS);
    expect(points[0].input).toBe(0);
    expect(points[points.length - 1].input).toBe(1);
    for (let index = 1; index < points.length; index += 1) {
      expect(points[index].outcome.finalFibrin).toBeGreaterThanOrEqual(
        points[index - 1].outcome.finalFibrin - 1e-9,
      );
    }
  });

  it('외부 입력 세기를 올리면 종단 노드가 줄지 않는다', () => {
    for (const targetId of ['factorIX', 'thrombin'] as const) {
      for (const mode of ['pulse', 'sustained'] as const) {
        const points = runInputSweep(
          { ...BASE, factorSupply: 0.1 },
          { targetId, mode, atTime: 1 },
        );
        expect(points).toHaveLength(SWEEP_STEPS);
        for (let index = 1; index < points.length; index += 1) {
          expect(points[index].outcome.finalFibrin).toBeGreaterThanOrEqual(
            points[index - 1].outcome.finalFibrin - 1e-9,
          );
        }
      }
    }
  });

  it('기준 공급값에서는 도달 비율이 1 근처가 된다', () => {
    const points = runFactorSweep(BASE);
    const nearest = points.reduce((best, point) =>
      Math.abs(point.input - REFERENCE_FACTOR_SUPPLY) <
      Math.abs(best.input - REFERENCE_FACTOR_SUPPLY)
        ? point
        : best,
    );
    expect(nearest.ratio).not.toBeNull();
    expect(nearest.ratio as number).toBeGreaterThan(0.85);
    expect(nearest.ratio as number).toBeLessThan(1.15);
  });

  it('기준 대비 비율에 상한을 씌우지 않는다', () => {
    const reference = { peakThrombin: 0, thrombinIntegral: 0, finalFibrin: 0.4, timeToThreshold: null };
    const outcome = { peakThrombin: 0, thrombinIntegral: 0, finalFibrin: 0.8, timeToThreshold: null };
    expect(structureRatio(outcome, reference)).toBeCloseTo(2, 10);
  });

  it('기준이 아무것도 쌓지 못했으면 비율을 내지 않는다', () => {
    const empty = { peakThrombin: 0, thrombinIntegral: 0, finalFibrin: 0, timeToThreshold: null };
    expect(structureRatio(empty, empty)).toBeNull();
  });
});
