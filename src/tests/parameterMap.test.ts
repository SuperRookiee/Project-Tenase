/**
 * 파라미터 지도 실행기의 불변식.
 *
 * 지도는 결정론적 엔진을 격자 모양으로 여러 번 돌려 결과를 늘어놓는 도구다. 그래서
 * 이 테스트들은 특정 수치가 아니라 결정론성, 범위, 단조성, 그리고 축과 보충 입력이
 * 실제로 그래프를 움직이는지에 집중한다. 조정 상수를 조금만 손봐도 무너질 곡선 모양은
 * 못으로 박아 두지 않는다.
 */
import { describe, expect, it } from 'vitest';
import {
  MAP_AXES,
  MAP_METRICS,
  MAP_RESOLUTION,
  MAX_PLAN_COUNT,
  PLAN_TARGETS,
  applyAxis,
  axisValueAt,
  computeMap,
  computeMapRow,
  createBaseSpec,
  getMapAxis,
  getMapMetric,
  isMapAxisId,
  readAxis,
  respondsToSupply,
  runOutcome,
  runTrace,
  washoutHalfTime,
  type InputPlan,
  type MapRunSpec,
} from '@/simulation/parameterMap';
import { ENTITY_DEFINITIONS } from '@/simulation/entities';
import { FIXED_STEP, createDefaultConfig, createEngine } from '@/simulation/engine';

/** 격자 테스트가 계속 가벼우려면 관찰 창이 짧아야 한다. */
const BASE: MapRunSpec = { ...createBaseSpec(), duration: 10 };

function spec(overrides: Partial<MapRunSpec> = {}): MapRunSpec {
  return { ...BASE, ...overrides };
}

function plan(overrides: Partial<InputPlan> = {}): InputPlan {
  return {
    targetId: 'factorIX',
    amount: 0.4,
    mode: 'pulse',
    atTime: 1,
    interval: 2,
    count: 3,
    ...overrides,
  };
}

describe('축 정의', () => {
  it('id가 서로 겹치지 않고 조회할 수 있다', () => {
    const ids = MAP_AXES.map((axis) => axis.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const axis of MAP_AXES) {
      expect(getMapAxis(axis.id)).toBe(axis);
      expect(isMapAxisId(axis.id)).toBe(true);
    }
    expect(isMapAxisId('없는-축')).toBe(false);
    expect(() => getMapAxis('없는-축' as never)).toThrow(RangeError);
  });

  it('기본값을 0–1 안에 둔다', () => {
    for (const axis of MAP_AXES) {
      expect(axis.defaultValue).toBeGreaterThanOrEqual(0);
      expect(axis.defaultValue).toBeLessThanOrEqual(1);
    }
  });

  it('공급 축은 저장형 노드만, 유지 축은 저장형이 아닌 노드만 겨냥한다', () => {
    // 이 구분이 지도의 핵심 전제다. 엔진은 저장형 노드에만 공급값을 보고 완화시키므로,
    // 저장형이 아닌 노드를 공급 축에 올리면 슬라이더가 아무것도 하지 않는다.
    for (const axis of MAP_AXES) {
      if (axis.kind === 'supply') expect(respondsToSupply(axis.entityId)).toBe(true);
      if (axis.kind === 'hold') expect(respondsToSupply(axis.entityId)).toBe(false);
    }
  });

  it('쓰고 읽으면 같은 값이 나온다', () => {
    for (const axis of MAP_AXES) {
      expect(readAxis(applyAxis(BASE, axis, 0.42), axis)).toBeCloseTo(0.42, 10);
    }
  });

  it('축을 쓸 때 원본 명세를 변경하지 않는다', () => {
    const axis = getMapAxis('factorIX');
    const before = JSON.stringify(BASE);
    applyAxis(BASE, axis, 0.9);
    expect(JSON.stringify(BASE)).toBe(before);
  });
});

describe('저장형이 아닌 노드의 공급값', () => {
  it('공급 설정값으로는 움직이지 않는다', () => {
    // 유지 축이 따로 있는 이유다. 일시형 노드에 공급값을 줘 봐야 엔진이 보지 않는다.
    const quiet = runOutcome(spec({ supply: { thrombin: 0 } }));
    const loud = runOutcome(spec({ supply: { thrombin: 1 } }));
    expect(loud).toEqual(quiet);
  });

  it('유지 축으로는 움직인다', () => {
    // 개시 신호를 0으로 닫아 두면 연쇄가 아예 시작되지 않으므로, 여기서 나오는
    // 종단 노드는 전부 바깥에서 붙들어 둔 중심 출력 노드에서 온 것이다.
    const closed = spec({ damageSignal: 0 });
    expect(runOutcome(closed).finalFibrin).toBe(0);

    const held = runOutcome({ ...closed, holds: { thrombin: 0.6 } });
    expect(held.finalFibrin).toBeGreaterThan(0);
    expect(held.peakThrombin).toBeGreaterThan(0);
  });

  it('유지 수준을 올리면 종단 노드가 줄지 않는다', () => {
    let previous = -1;
    for (const level of [0, 0.25, 0.5, 0.75, 1]) {
      const outcome = runOutcome(spec({ damageSignal: 0, holds: { thrombin: level } }));
      expect(outcome.finalFibrin).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = outcome.finalFibrin;
    }
  });

  it('유지 수준이 0이면 붙들지 않은 것과 같다', () => {
    expect(runOutcome(spec({ holds: { thrombin: 0 } }))).toEqual(runOutcome(spec()));
  });
});

describe('실행', () => {
  it('같은 명세는 언제나 같은 결과를 낸다', () => {
    const subject = spec({ supply: { factorIX: 0.3 }, plan: plan({ mode: 'repeated' }) });
    expect(runOutcome(subject)).toEqual(runOutcome(subject));
    expect(runTrace(subject)).toEqual(runTrace(subject));
  });

  it('표본을 담든 담지 않든 결과값이 같다', () => {
    // 지도는 칸마다 표본을 건너뛴다. 그 지름길이 숫자를 바꾼다면 지도와 곡선이
    // 서로 다른 이야기를 하게 된다.
    for (const subject of [
      spec(),
      spec({ supply: { factorIX: 0.2 }, holds: { thrombin: 0.4 } }),
      spec({ plan: plan({ mode: 'sustained', targetId: 'thrombin' }) }),
      spec({ plan: plan({ mode: 'repeated', count: 4, interval: 1.5 }) }),
    ]) {
      expect(runOutcome(subject)).toEqual(runTrace(subject).outcome);
    }
  });

  it('모든 표본과 결과값을 0–1 안에 둔다', () => {
    const trace = runTrace(
      spec({
        supply: { factorIX: 1, factorVIIIa: 1, prothrombin: 1, fibrinogen: 1 },
        holds: { thrombin: 1, factorIXa: 1 },
        plan: plan({ amount: 1, mode: 'sustained', targetId: 'thrombin', atTime: 0 }),
      }),
    );
    for (const sample of trace.samples) {
      for (const key of ['factorIXa', 'factorXa', 'thrombin', 'fibrin'] as const) {
        expect(sample[key]).toBeGreaterThanOrEqual(0);
        expect(sample[key]).toBeLessThanOrEqual(1);
      }
    }
    const { peakThrombin, meanThrombin, finalFibrin, shortfallFraction } = trace.outcome;
    for (const value of [peakThrombin, meanThrombin, finalFibrin, shortfallFraction]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('관찰 창을 벗어나지 않는 표본을 시간 순으로 담는다', () => {
    const trace = runTrace(spec());
    expect(trace.samples.length).toBeGreaterThan(1);
    expect(trace.samples[0].time).toBe(0);
    expect(trace.samples[trace.samples.length - 1].time).toBeCloseTo(BASE.duration, 6);
    for (let index = 1; index < trace.samples.length; index += 1) {
      expect(trace.samples[index].time).toBeGreaterThan(trace.samples[index - 1].time);
    }
  });

  it('미달 구간 비율과 기준선 도달 시각이 서로 어긋나지 않는다', () => {
    for (const supply of [0, 0.2, 0.5, 1]) {
      const outcome = runOutcome(spec({ supply: { factorIX: supply }, duration: 30 }));
      // 창 내내 기준선 아래였다는 것과 끝내 못 넘었다는 것은 같은 말이어야 한다.
      expect(outcome.shortfallFraction === 1).toBe(outcome.timeToThreshold === null);
    }
  });

  it('개시 노드가 비어 있고 붙들어 둔 것도 없으면 하류가 켜지지 않는다', () => {
    const outcome = runOutcome(spec({ supply: { factorIX: 0 } }));
    expect(outcome.peakThrombin).toBe(0);
    expect(outcome.finalFibrin).toBe(0);
    expect(outcome.timeToThreshold).toBeNull();
    expect(outcome.shortfallFraction).toBe(1);
  });
});

describe('단조성', () => {
  it('개시 노드 공급값을 올리면 종단 노드가 줄지 않는다', () => {
    let previous = -1;
    for (let index = 0; index < 6; index += 1) {
      const outcome = runOutcome(spec({ supply: { factorIX: index / 5 } }));
      expect(outcome.finalFibrin).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = outcome.finalFibrin;
    }
  });

  it('억제 노드 공급값을 올리면 종단 노드가 늘지 않는다', () => {
    for (const inhibitor of ['antithrombin', 'tfpi'] as const) {
      let previous = Number.POSITIVE_INFINITY;
      for (let index = 0; index < 6; index += 1) {
        const outcome = runOutcome(spec({ supply: { [inhibitor]: index / 5 } }));
        expect(outcome.finalFibrin).toBeLessThanOrEqual(previous + 1e-9);
        previous = outcome.finalFibrin;
      }
    }
  });
});

describe('보충 입력 계획', () => {
  it('세기가 0인 계획은 계획이 없는 것과 같다', () => {
    for (const mode of ['pulse', 'sustained', 'repeated'] as const) {
      expect(runOutcome(spec({ plan: plan({ amount: 0, mode }) }))).toEqual(
        runOutcome(spec()),
      );
    }
  });

  it('한 번만 넣는 반복 계획은 일회 입력과 같다', () => {
    const once = runOutcome(spec({ plan: plan({ mode: 'repeated', count: 1 }) }));
    expect(once).toEqual(runOutcome(spec({ plan: plan({ mode: 'pulse' }) })));
  });

  it('입력 시각 이전에는 아무것도 바꾸지 않는다', () => {
    const quiet = runTrace(spec({ supply: { factorIX: 0.2 } }));
    const pushed = runTrace(
      spec({
        supply: { factorIX: 0.2 },
        plan: plan({ targetId: 'thrombin', amount: 0.5, mode: 'pulse', atTime: 5 }),
      }),
    );
    quiet.samples
      .filter((sample) => sample.time < 5)
      .forEach((sample, index) => {
        expect(pushed.samples[index].thrombin).toBeCloseTo(sample.thrombin, 10);
      });
    expect(pushed.outcome.finalFibrin).toBeGreaterThan(quiet.outcome.finalFibrin);
  });

  it('반복 계획에서 횟수를 늘리면 종단 노드가 줄지 않는다', () => {
    let previous = -1;
    for (let count = 1; count <= 5; count += 1) {
      const outcome = runOutcome(
        spec({
          supply: { factorIX: 0.1 },
          plan: plan({ targetId: 'factorIX', mode: 'repeated', count, interval: 1.5 }),
        }),
      );
      expect(outcome.finalFibrin).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = outcome.finalFibrin;
    }
  });

  it('관찰 창을 넘어가는 입력은 버리고 마지막 스텝에 몰지 않는다', () => {
    // 창이 10이고 t1부터 4 간격이면 t1·t5·t9만 들어간다. t13은 창 밖이다.
    const clipped = runOutcome(
      spec({ plan: plan({ mode: 'repeated', count: 9, interval: 4, atTime: 1 }) }),
    );
    const exact = runOutcome(
      spec({ plan: plan({ mode: 'repeated', count: 3, interval: 4, atTime: 1 }) }),
    );
    expect(clipped).toEqual(exact);
  });

  it('반복 횟수를 상한 위로 올려도 상한만큼만 넣는다', () => {
    const overflowing = runOutcome(
      spec({
        duration: 40,
        supply: { factorIX: 0.1 },
        plan: plan({ mode: 'repeated', count: MAX_PLAN_COUNT + 20, interval: 1 }),
      }),
    );
    const capped = runOutcome(
      spec({
        duration: 40,
        supply: { factorIX: 0.1 },
        plan: plan({ mode: 'repeated', count: MAX_PLAN_COUNT, interval: 1 }),
      }),
    );
    expect(overflowing).toEqual(capped);
  });
});

describe('격자', () => {
  const xAxis = getMapAxis('factorIX');
  const yAxis = getMapAxis('antithrombin');
  const RESOLUTION = 5;

  it('칸을 빠짐없이 채우고 축 값을 0에서 1까지 늘어놓는다', () => {
    const cells = computeMap(BASE, xAxis, yAxis, RESOLUTION);
    expect(cells).toHaveLength(RESOLUTION * RESOLUTION);

    for (const cell of cells) {
      expect(cell.x).toBeCloseTo(axisValueAt(cell.xIndex, RESOLUTION), 10);
      expect(cell.y).toBeCloseTo(axisValueAt(cell.yIndex, RESOLUTION), 10);
    }
    expect(cells[0].x).toBe(0);
    expect(cells[0].y).toBe(0);
    expect(cells[cells.length - 1].x).toBe(1);
    expect(cells[cells.length - 1].y).toBe(1);
  });

  it('줄 단위로 나눠 계산해도 한 번에 계산한 것과 같다', () => {
    // 화면은 지도를 줄씩 채운다. 그 경로가 다른 숫자를 낸다면 화면과 테스트가
    // 서로 다른 지도를 보게 된다.
    const whole = computeMap(BASE, xAxis, yAxis, RESOLUTION);
    const byRow = Array.from({ length: RESOLUTION }, (_, yIndex) =>
      computeMapRow(BASE, xAxis, yAxis, yIndex, RESOLUTION),
    ).flat();
    expect(byRow).toEqual(whole);
  });

  it('격자 한 변의 기본 칸 수를 홀수로 둬 한가운데 칸이 생기게 한다', () => {
    expect(MAP_RESOLUTION % 2).toBe(1);
    expect(MAP_RESOLUTION).toBeGreaterThan(2);
  });

  it('축을 맞바꾸면 지도가 대각선으로 뒤집힌다', () => {
    const forward = computeMap(BASE, xAxis, yAxis, RESOLUTION);
    const swapped = computeMap(BASE, yAxis, xAxis, RESOLUTION);
    for (const cell of forward) {
      const mirrored = swapped.find(
        (other) => other.xIndex === cell.yIndex && other.yIndex === cell.xIndex,
      );
      expect(mirrored?.outcome).toEqual(cell.outcome);
    }
  });
});

describe('반감 시간', () => {
  it('저장형 노드는 보충 비율에서, 나머지는 소실 비율에서 유도한다', () => {
    for (const entity of ENTITY_DEFINITIONS) {
      const rate =
        entity.behavior === 'reservoir' ? entity.replenishment : entity.clearance;
      const half = washoutHalfTime(entity.id);
      if (rate > 0) {
        expect(half).not.toBeNull();
        expect(half as number).toBeCloseTo(Math.LN2 / rate, 10);
      } else {
        expect(half).toBeNull();
      }
    }
  });

  it('실제로 그만큼 지나면 밀어 넣은 값이 절반이 된다', () => {
    // 정의가 엔진의 기본 회전량과 어긋나지 않는지 본다. 다른 엣지가 끼어들지 않도록
    // 개시 신호를 닫고 억제 노드를 비운 채, 종단 노드에만 값을 넣어 흘려보낸다.
    const half = washoutHalfTime('fibrin');
    expect(half).not.toBeNull();

    const engine = createEngine({
      ...createDefaultConfig(),
      vesselDamageSignal: 0,
    });
    engine.applyInput('fibrin', 0.8);

    const steps = Math.round((half as number) / FIXED_STEP);
    for (let step = 0; step < steps; step += 1) engine.step();

    // 고정 스텝 오일러 적분이라 해석해와 완전히 같지는 않다. 두 자리면 충분하다.
    expect(engine.getState().levels.fibrin).toBeCloseTo(0.4, 2);
  });

  it('밀어 넣을 수 있는 노드는 모두 반감 시간을 낸다', () => {
    // 화면이 대상 노드마다 이 값을 적으므로 빈칸이 생기면 안 된다.
    for (const id of PLAN_TARGETS) {
      expect(washoutHalfTime(id)).not.toBeNull();
    }
  });
});

describe('결과값 정의', () => {
  it('id가 서로 겹치지 않고 조회할 수 있다', () => {
    const ids = MAP_METRICS.map((metric) => metric.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const metric of MAP_METRICS) {
      expect(getMapMetric(metric.id)).toBe(metric);
    }
    expect(() => getMapMetric('없는-결과값' as never)).toThrow(RangeError);
  });

  it('색칠에 쓰는 값을 0–1 안에 두거나 해당 없음으로 남긴다', () => {
    const outcomes = [
      runOutcome(spec({ supply: { factorIX: 0 } })),
      runOutcome(spec({ supply: { factorIX: 0.5 } })),
      runOutcome(spec({ supply: { factorIX: 1 }, duration: 30 })),
    ];
    for (const metric of MAP_METRICS) {
      for (const outcome of outcomes) {
        const value = metric.select(outcome, BASE.duration);
        if (value === null) continue;
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
        expect(metric.format(outcome).length).toBeGreaterThan(0);
      }
    }
  });

  it('기준선에 닿지 못한 칸의 도달 시각은 해당 없음으로 남긴다', () => {
    const empty = runOutcome(spec({ supply: { factorIX: 0 } }));
    expect(getMapMetric('timeToThreshold').select(empty, BASE.duration)).toBeNull();
    expect(getMapMetric('timeToThreshold').format(empty)).toBe('미도달');
  });
});
