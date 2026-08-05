/**
 * 파라미터 지도 실행기.
 *
 * 범위 고지
 * ---------
 * 이 모듈은 `engine.ts`의 가상 반응 그래프를 설정만 바꿔 격자 모양으로 여러 번 돌리고,
 * 각 칸의 결과를 하나의 지도로 늘어놓는다. 노드가 응고 생물학의 이름을 빌려 쓰지만
 * 그것은 순전히 라벨일 뿐이고, 여기 있는 어떤 값도 측정값이 아니다. 모든 양은 0–1
 * 무차원이며, 두 축과 "보충 입력"은 모두 그래프 바깥에서 노드를 밀어 올리는 조작에
 * 붙인 이름이다. 어떤 상태, 절차, 프로토콜, 제품, 집단에도 대응하지 않는다.
 *
 * `scenarioSweep.ts`와의 차이
 * ---------------------------
 * 시나리오 비교는 축 하나를 쓸어보며 곡선을 그린다. 여기서는 축 *둘*을 동시에 쓸어
 * 평면 전체를 채우므로, 두 설정이 서로를 어떻게 상쇄하거나 겹치는지가 한눈에 보인다.
 * 보충 입력도 더 넓다. 시나리오 비교는 일회·지속 두 가지만 다루지만 여기서는 일정
 * 간격으로 여러 번 넣는 방식까지 포함한다.
 *
 * 엔진이 결정론적이고 I/O를 하지 않으므로 같은 명세는 언제나 같은 결과를 낸다.
 */
import { ENTITY_DEFINITIONS, getEntity } from './entities';
import { FIXED_STEP, createDefaultConfig, createEngine } from './engine';
import { clamp01 } from './numeric';
import { STRUCTURE_THRESHOLD, SUSTAINED_RATE } from './scenarioSweep';
import type { EntityId, SimulationConfig } from './types';

/**
 * 지도의 축에 올릴 수 있는 설정.
 *
 * 종류에 따라 엔진에 닿는 경로가 다르다.
 *
 * - `supply` — 저장형 노드의 공급 설정값을 옮긴다. 그 노드는 매 스텝 이 값 쪽으로
 *   완화되므로, 축 값이 곧 그 노드가 머무는 수준이 된다.
 * - `signal` — 전역 손상 개시 신호를 옮긴다. 노드가 아니라 개시 엣지를 여는 값이다.
 * - `hold` — 일시형 노드를 바깥에서 그 수준 아래로 내려가지 않게 붙들어 둔다.
 *   일시형 노드에는 공급 설정값이 아예 없다. 엔진은 저장형 노드에만 공급값을 보고
 *   완화시키고 일시형 노드는 그냥 감쇠시키므로(`engine.ts`의 기본 회전량 참고),
 *   일시형 노드를 어떤 수준에 두려면 바깥에서 계속 채워 넣는 수밖에 없다.
 */
export type MapAxisKind = 'supply' | 'signal' | 'hold';

export type MapAxisId =
  | 'factorIX'
  | 'factorVIIIa'
  | 'prothrombin'
  | 'antithrombin'
  | 'tfpi'
  | 'platelets'
  | 'damage'
  | 'thrombinHold'
  | 'factorIXaHold';

interface MapAxisBase {
  readonly id: MapAxisId;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  /** 축을 건드리지 않을 때 쓰는 값. 엔티티 기본값이나 기본 설정에서 가져온다. */
  readonly defaultValue: number;
}

export type MapAxis =
  | (MapAxisBase & { readonly kind: 'supply'; readonly entityId: EntityId })
  | (MapAxisBase & { readonly kind: 'hold'; readonly entityId: EntityId })
  | (MapAxisBase & { readonly kind: 'signal'; readonly entityId: null });

function supplyDefault(id: EntityId): number {
  return getEntity(id).defaultSupply;
}

export const MAP_AXES: readonly MapAxis[] = [
  {
    id: 'factorIX',
    kind: 'supply',
    entityId: 'factorIX',
    label: 'Factor IX 공급값',
    shortLabel: 'IX 공급',
    description:
      '상류 전구 노드가 머무는 수준. 개시 엣지가 여기서 재료를 가져간다.',
    defaultValue: supplyDefault('factorIX'),
  },
  {
    id: 'factorVIIIa',
    kind: 'supply',
    entityId: 'factorVIIIa',
    label: 'Factor VIIIa 공급값',
    shortLabel: 'VIIIa 공급',
    description:
      '보조인자 노드가 머무는 수준. 복합체 조립 엣지가 활성형 상류 노드와 함께 이것을 소모한다.',
    defaultValue: supplyDefault('factorVIIIa'),
  },
  {
    id: 'prothrombin',
    kind: 'supply',
    entityId: 'prothrombin',
    label: 'Prothrombin 공급값',
    shortLabel: 'PT 공급',
    description: '중심 출력 노드가 만들어질 때 소모되는 하류 전구 노드의 수준.',
    defaultValue: supplyDefault('prothrombin'),
  },
  {
    id: 'antithrombin',
    kind: 'supply',
    entityId: 'antithrombin',
    label: 'Antithrombin 공급값',
    shortLabel: 'AT 공급',
    description:
      '두 번째 억제 노드의 수준. 높을수록 중심 출력 노드를 더 빠르게 걷어낸다.',
    defaultValue: supplyDefault('antithrombin'),
  },
  {
    id: 'tfpi',
    kind: 'supply',
    entityId: 'tfpi',
    label: 'TFPI 공급값',
    shortLabel: 'TFPI 공급',
    description:
      '첫 번째 억제 노드의 수준. 반응망 중간부의 활성형 노드를 만드는 엣지를 약화시키고 그 노드를 직접 걷어내기도 한다.',
    defaultValue: supplyDefault('tfpi'),
  },
  {
    id: 'platelets',
    kind: 'supply',
    entityId: 'platelets',
    label: 'Platelets 공급값',
    shortLabel: 'PLT 공급',
    description:
      '표면 노드의 수준. 개시·결합·중심 출력 엣지가 모두 이 노드를 촉매로 참조한다.',
    defaultValue: supplyDefault('platelets'),
  },
  {
    id: 'damage',
    kind: 'signal',
    entityId: null,
    label: '손상 개시 신호',
    shortLabel: '개시 신호',
    description: '개시 엣지를 여는 전역 신호. 0이면 연쇄가 아예 시작되지 않는다.',
    defaultValue: createDefaultConfig().vesselDamageSignal,
  },
  {
    id: 'thrombinHold',
    kind: 'hold',
    entityId: 'thrombin',
    label: 'Thrombin 유지 수준',
    shortLabel: 'THR 유지',
    description:
      '중심 출력 노드를 바깥에서 이 수준 아래로 내려가지 않게 붙들어 둔다. 이 노드는 일시형이라 공급 설정값이 없다.',
    defaultValue: 0,
  },
  {
    id: 'factorIXaHold',
    kind: 'hold',
    entityId: 'factorIXa',
    label: 'Factor IXa 유지 수준',
    shortLabel: 'IXa 유지',
    description:
      '활성형 상류 노드를 바깥에서 이 수준 아래로 내려가지 않게 붙들어 둔다. 개시 엣지를 건너뛰고 그 아래를 살펴볼 때 쓴다.',
    defaultValue: 0,
  },
] as const;

const AXIS_MAP: ReadonlyMap<MapAxisId, MapAxis> = new Map(
  MAP_AXES.map((axis) => [axis.id, axis] as const),
);

export function getMapAxis(id: MapAxisId): MapAxis {
  const axis = AXIS_MAP.get(id);
  if (!axis) {
    throw new RangeError(`알 수 없는 축 id: ${String(id)}`);
  }
  return axis;
}

export function isMapAxisId(value: unknown): value is MapAxisId {
  return typeof value === 'string' && AXIS_MAP.has(value as MapAxisId);
}

/**
 * 보충 입력을 받을 수 있는 노드.
 *
 * 전구 노드와 보조인자, 그리고 중심 출력 노드를 열어 둔다. 종단 구조 노드와 억제
 * 노드는 제외했다. 그쪽을 직접 밀어 올리면 그래프를 살펴보는 대신 답을 손으로 적어
 * 넣는 셈이 되기 때문이다.
 */
export const PLAN_TARGETS: readonly EntityId[] = [
  'factorIX',
  'factorVIIIa',
  'factorX',
  'prothrombin',
  'fibrinogen',
  'thrombin',
];

/**
 * - `pulse` — 지정한 모델 시각에 한 번만 밀어 올린다.
 * - `sustained` — 그 시각부터 관찰이 끝날 때까지 매 스텝 조금씩 넣는다.
 * - `repeated` — 그 시각부터 일정 간격으로 정해진 횟수만큼 같은 양을 넣는다.
 */
export type PlanMode = 'pulse' | 'sustained' | 'repeated';

export interface InputPlan {
  readonly targetId: EntityId;
  /** 0–1 무차원 세기. */
  readonly amount: number;
  readonly mode: PlanMode;
  /** 첫 입력이 들어가는 모델 시각. */
  readonly atTime: number;
  /** `repeated`에서 입력 사이의 모델 시간 간격. 다른 방식에서는 무시된다. */
  readonly interval: number;
  /** `repeated`에서 넣을 총 횟수. 다른 방식에서는 무시된다. */
  readonly count: number;
}

/** `repeated`가 한 번의 실행에서 넣을 수 있는 최대 횟수. */
export const MAX_PLAN_COUNT = 12;

export interface MapRunSpec {
  /** 저장형 노드의 공급 설정값 덮어쓰기. 일시형 노드에는 효과가 없다. */
  readonly supply: Readonly<Partial<Record<EntityId, number>>>;
  readonly damageSignal: number;
  /** 노드별 하한. 매 스텝 이 값 아래로 내려가지 않게 바깥에서 채워 넣는다. */
  readonly holds: Readonly<Partial<Record<EntityId, number>>>;
  readonly plan: InputPlan | null;
  /** 관찰 창의 길이. 추상 모델 시간 단위다. */
  readonly duration: number;
}

export interface MapOutcome {
  /** 관찰 창 안에서 중심 출력 노드가 도달한 최고 수준. */
  readonly peakThrombin: number;
  /** 중심 출력 노드의 시간 적분을 관찰 창 길이로 나눈 값. 0–1. */
  readonly meanThrombin: number;
  /** 관찰 창이 끝나는 순간의 종단 구조 노드 수준. */
  readonly finalFibrin: number;
  /** 종단 구조 노드가 기준선을 넘어선 모델 시각. 끝내 못 넘으면 `null`. */
  readonly timeToThreshold: number | null;
  /**
   * 종단 구조 노드가 기준선 아래에 머문 스텝의 비율. 0–1.
   *
   * 1이면 관찰 창 내내 한 번도 기준선에 닿지 못했다는 뜻이고, 0이면 첫 스텝부터
   * 끝까지 기준선 위에 있었다는 뜻이다. 이것은 그래프가 실제로 계산한 값을 그대로
   * 적은 것이지 어떤 결과에 대한 판정이 아니다.
   */
  readonly shortfallFraction: number;
}

export interface MapSample {
  readonly time: number;
  readonly factorIXa: number;
  readonly factorXa: number;
  readonly thrombin: number;
  readonly fibrin: number;
}

export interface MapTrace {
  readonly samples: readonly MapSample[];
  readonly outcome: MapOutcome;
}

/** 곡선 하나에 담기는 표본 수의 목표치. 차트가 감당할 만큼으로 솎아 낸다. */
const TARGET_SAMPLE_COUNT = 150;

const RESERVOIR_IDS: ReadonlySet<EntityId> = new Set(
  ENTITY_DEFINITIONS.filter((entity) => entity.behavior === 'reservoir').map(
    (entity) => entity.id,
  ),
);

/** 공급 설정값이 실제로 무언가를 바꾸는 노드인지. 저장형 노드만 해당한다. */
export function respondsToSupply(id: EntityId): boolean {
  return RESERVOIR_IDS.has(id);
}

/**
 * 바깥에서 밀어 넣은 양이 절반으로 줄어드는 데 걸리는 추상 모델 시간.
 *
 * 이 값이 무엇이고 무엇이 아닌지
 * ------------------------------
 * 엔진의 기본 회전량(`engine.ts`의 스텝 말미)은 노드마다 지수 형태다. 저장형 노드는
 * 공급 설정값 쪽으로 `replenishment` 비율만큼 완화되므로 공급값을 넘어선 초과분이
 * 지수로 줄고, 그 밖의 노드는 `clearance` 비율로 그냥 줄어든다. 두 경우 모두 절반이
 * 되기까지 걸리는 시간은 ln 2를 그 비율로 나눈 값이다.
 *
 * 이것은 **그 노드 하나를 떼어 놓고 본 값**이다. 실제 실행에서는 그 노드를 소모하거나
 * 만들어 내는 엣지가 함께 작용하므로 관측되는 감소는 이 값과 다르다. 단위는 추상 모델
 * 시간이며 실제 시간으로 옮기는 환산은 이 프로젝트에 없다. 비율이 0이면 저절로 줄지
 * 않는다는 뜻이므로 `null`을 돌려준다.
 */
export function washoutHalfTime(id: EntityId): number | null {
  const entity = getEntity(id);
  const rate =
    entity.behavior === 'reservoir' ? entity.replenishment : entity.clearance;
  if (!(rate > 0)) return null;
  return Math.LN2 / rate;
}

export function createBaseSpec(): MapRunSpec {
  return {
    supply: {},
    damageSignal: createDefaultConfig().vesselDamageSignal,
    holds: {},
    plan: null,
    duration: 20,
  };
}

/** 축 값 하나를 명세에 써 넣는다. 원본은 건드리지 않는다. */
export function applyAxis(
  spec: MapRunSpec,
  axis: MapAxis,
  value: number,
): MapRunSpec {
  const clamped = clamp01(value);
  if (axis.kind === 'signal') {
    return { ...spec, damageSignal: clamped };
  }
  if (axis.kind === 'hold') {
    return { ...spec, holds: { ...spec.holds, [axis.entityId]: clamped } };
  }
  return { ...spec, supply: { ...spec.supply, [axis.entityId]: clamped } };
}

/** 명세에서 축이 현재 가리키는 값을 읽는다. 지도 위에 현재 설정을 표시할 때 쓴다. */
export function readAxis(spec: MapRunSpec, axis: MapAxis): number {
  if (axis.kind === 'signal') return spec.damageSignal;
  if (axis.kind === 'hold') return spec.holds[axis.entityId] ?? 0;
  return spec.supply[axis.entityId] ?? axis.defaultValue;
}

function buildConfig(spec: MapRunSpec): SimulationConfig {
  const base = createDefaultConfig();
  const supply = { ...base.supply };
  for (const entity of ENTITY_DEFINITIONS) {
    const override = spec.supply[entity.id];
    if (typeof override === 'number') {
      supply[entity.id] = clamp01(override);
    }
  }
  return {
    ...base,
    supply,
    vesselDamageSignal: clamp01(spec.damageSignal),
  };
}

/**
 * 명세 하나를 처음부터 끝까지 돌린다.
 *
 * `collectSamples`가 거짓이면 표본 배열을 아예 만들지 않는다. 지도는 칸마다 결과값만
 * 필요한데 격자 하나가 수백 번의 실행이므로, 쓰지도 않을 표본을 담느라 배열을 할당하면
 * 그만큼이 고스란히 낭비된다.
 */
function simulate(
  spec: MapRunSpec,
  collectSamples: boolean,
): { samples: MapSample[]; outcome: MapOutcome } {
  const engine = createEngine(buildConfig(spec));
  const totalSteps = Math.max(1, Math.round(spec.duration / FIXED_STEP));
  const sampleEvery = Math.max(1, Math.floor(totalSteps / TARGET_SAMPLE_COUNT));

  const holds = (Object.entries(spec.holds) as [EntityId, number | undefined][])
    .filter((entry): entry is [EntityId, number] => typeof entry[1] === 'number' && entry[1] > 0)
    .map(([id, value]) => [id, clamp01(value)] as const);

  const plan = spec.plan;
  const amount = plan ? clamp01(plan.amount) : 0;
  const sustainedPerStep =
    plan && plan.mode === 'sustained' ? amount * SUSTAINED_RATE * FIXED_STEP : 0;

  // 일회·반복 입력이 들어갈 모델 시각을 미리 늘어놓는다. 반복은 관찰 창을 넘어가는
  // 시각을 잘라 내므로, 창을 줄였을 때 남은 입력이 마지막 스텝에 몰리지 않는다.
  const scheduled: number[] = [];
  if (plan && amount > 0) {
    if (plan.mode === 'pulse') {
      scheduled.push(plan.atTime);
    } else if (plan.mode === 'repeated') {
      const count = Math.max(1, Math.min(MAX_PLAN_COUNT, Math.floor(plan.count)));
      const interval = Math.max(0, plan.interval);
      for (let index = 0; index < count; index += 1) {
        const at = plan.atTime + interval * index;
        if (at > spec.duration) break;
        scheduled.push(at);
      }
    }
  }
  let nextScheduled = 0;

  const samples: MapSample[] = [];
  const capture = (): void => {
    const state = engine.getState();
    samples.push({
      time: state.time,
      factorIXa: state.levels.factorIXa,
      factorXa: state.levels.factorXa,
      thrombin: state.levels.thrombin,
      fibrin: state.levels.fibrin,
    });
  };

  if (collectSamples) capture();

  let peakThrombin = 0;
  let integral = 0;
  let timeToThreshold: number | null = null;
  let belowSteps = 0;

  for (let step = 0; step < totalSteps; step += 1) {
    const before = engine.getState();
    const time = before.time;

    // 바깥에서 넣는 값은 모두 스텝 이전에 반영한다. 그래야 이번 스텝의 반응이 곧바로
    // 그 값을 본다.
    for (const [id, floor] of holds) {
      const shortfall = floor - before.levels[id];
      if (shortfall > 0) engine.applyInput(id, shortfall);
    }
    while (nextScheduled < scheduled.length && time >= scheduled[nextScheduled]) {
      if (plan) engine.applyInput(plan.targetId, amount);
      nextScheduled += 1;
    }
    if (plan && sustainedPerStep > 0 && time >= plan.atTime) {
      engine.applyInput(plan.targetId, sustainedPerStep);
    }

    engine.step();

    const state = engine.getState();
    const thrombin = state.levels.thrombin;
    if (thrombin > peakThrombin) peakThrombin = thrombin;
    integral += thrombin * FIXED_STEP;
    if (state.levels.fibrin < STRUCTURE_THRESHOLD) {
      belowSteps += 1;
    } else if (timeToThreshold === null) {
      timeToThreshold = state.time;
    }

    if (collectSamples && (step + 1) % sampleEvery === 0) capture();
  }

  const finalState = engine.getState();
  if (collectSamples && samples[samples.length - 1]?.time !== finalState.time) {
    capture();
  }

  const elapsed = totalSteps * FIXED_STEP;
  return {
    samples,
    outcome: {
      peakThrombin: clamp01(peakThrombin),
      meanThrombin: clamp01(elapsed > 0 ? integral / elapsed : 0),
      finalFibrin: clamp01(finalState.levels.fibrin),
      timeToThreshold,
      shortfallFraction: clamp01(belowSteps / totalSteps),
    },
  };
}

/** 결과값만 돌려준다. 지도의 칸을 채울 때 쓴다. */
export function runOutcome(spec: MapRunSpec): MapOutcome {
  return simulate(spec, false).outcome;
}

/** 곡선과 결과값을 함께 돌려준다. 칸 하나를 자세히 들여다볼 때 쓴다. */
export function runTrace(spec: MapRunSpec): MapTrace {
  const { samples, outcome } = simulate(spec, true);
  return { samples, outcome };
}

/**
 * 지도에 색으로 칠할 수 있는 결과값.
 *
 * `select`는 0–1로 정규화한 표시값을 돌려준다. `higherIsFurther`가 참이면 값이 클수록
 * 반응망이 더 멀리 간 것이고, 거짓이면 그 반대다. 범례가 이 방향을 글로 적어 두므로
 * 지도를 색만으로 읽지 않아도 된다.
 */
export type MapMetricId =
  | 'finalFibrin'
  | 'shortfallFraction'
  | 'peakThrombin'
  | 'timeToThreshold';

export interface MapMetric {
  readonly id: MapMetricId;
  readonly label: string;
  readonly description: string;
  readonly higherIsFurther: boolean;
  /** 색칠에 쓰는 0–1 값. 해당 없음이면 `null`. */
  select(outcome: MapOutcome, duration: number): number | null;
  /** 칸 하나를 글로 적을 때 쓰는 표기. */
  format(outcome: MapOutcome): string;
}

export const MAP_METRICS: readonly MapMetric[] = [
  {
    id: 'finalFibrin',
    label: '종단 구조 노드 도달 수준',
    description:
      '관찰 창이 끝나는 순간 Fibrin 노드가 어디까지 쌓였는지. 값이 클수록 반응망이 멀리 간 것이다.',
    higherIsFurther: true,
    select: (outcome) => outcome.finalFibrin,
    format: (outcome) => outcome.finalFibrin.toFixed(3),
  },
  {
    id: 'shortfallFraction',
    label: '기준선 미달 구간 비율',
    description:
      '종단 구조 노드가 기준선 아래에 머문 관찰 창의 비율. 1이면 창 내내 한 번도 기준선에 닿지 못한 것이다.',
    higherIsFurther: false,
    select: (outcome) => outcome.shortfallFraction,
    format: (outcome) => `${Math.round(outcome.shortfallFraction * 100)}%`,
  },
  {
    id: 'peakThrombin',
    label: '최고 Thrombin 수준',
    description:
      '관찰 창 안에서 중심 출력 노드가 도달한 가장 높은 값. 값이 클수록 반응망이 멀리 간 것이다.',
    higherIsFurther: true,
    select: (outcome) => outcome.peakThrombin,
    format: (outcome) => outcome.peakThrombin.toFixed(3),
  },
  {
    id: 'timeToThreshold',
    label: '기준선 도달 시각',
    description:
      '종단 구조 노드가 기준선을 처음 넘어선 모델 시각을 관찰 창 길이로 나눈 값. 창 안에서 못 넘으면 빈 칸으로 남는다.',
    higherIsFurther: false,
    select: (outcome, duration) =>
      outcome.timeToThreshold === null || duration <= 0
        ? null
        : clamp01(outcome.timeToThreshold / duration),
    format: (outcome) =>
      outcome.timeToThreshold === null
        ? '미도달'
        : `t ${outcome.timeToThreshold.toFixed(1)}`,
  },
] as const;

const METRIC_MAP: ReadonlyMap<MapMetricId, MapMetric> = new Map(
  MAP_METRICS.map((metric) => [metric.id, metric] as const),
);

export function getMapMetric(id: MapMetricId): MapMetric {
  const metric = METRIC_MAP.get(id);
  if (!metric) {
    throw new RangeError(`알 수 없는 결과값 id: ${String(id)}`);
  }
  return metric;
}

export interface MapCell {
  readonly xIndex: number;
  readonly yIndex: number;
  /** 가로축 값 0–1. */
  readonly x: number;
  /** 세로축 값 0–1. */
  readonly y: number;
  readonly outcome: MapOutcome;
}

/** 격자 한 변의 칸 수. 화면에서 읽히면서 계산이 감당할 만한 값이다. */
export const MAP_RESOLUTION = 17;

/** 격자 색인을 0–1 축 값으로 옮긴다. */
export function axisValueAt(index: number, resolution: number): number {
  if (resolution <= 1) return 0;
  return clamp01(index / (resolution - 1));
}

/**
 * 격자의 한 줄을 계산한다.
 *
 * 지도 전체는 한 번에 수백 번의 실행이라 한 프레임 안에 끝내면 화면이 눈에 띄게 멎는다.
 * 호출자가 줄 단위로 나눠 돌릴 수 있도록 여기서 한 줄씩만 내어 준다.
 */
export function computeMapRow(
  base: MapRunSpec,
  xAxis: MapAxis,
  yAxis: MapAxis,
  yIndex: number,
  resolution: number = MAP_RESOLUTION,
): readonly MapCell[] {
  const y = axisValueAt(yIndex, resolution);
  const withY = applyAxis(base, yAxis, y);

  return Array.from({ length: resolution }, (_, xIndex) => {
    const x = axisValueAt(xIndex, resolution);
    return {
      xIndex,
      yIndex,
      x,
      y,
      outcome: runOutcome(applyAxis(withY, xAxis, x)),
    };
  });
}

/**
 * 격자 전체를 한 번에 계산한다.
 *
 * 화면은 `computeMapRow`로 줄씩 나눠 채운다. 이 함수는 테스트와 한 번에 끝내도 되는
 * 호출자를 위한 것이다.
 */
export function computeMap(
  base: MapRunSpec,
  xAxis: MapAxis,
  yAxis: MapAxis,
  resolution: number = MAP_RESOLUTION,
): readonly MapCell[] {
  const cells: MapCell[] = [];
  for (let yIndex = 0; yIndex < resolution; yIndex += 1) {
    cells.push(...computeMapRow(base, xAxis, yAxis, yIndex, resolution));
  }
  return cells;
}
