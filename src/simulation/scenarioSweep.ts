/**
 * 시나리오 일괄 실행기.
 *
 * 범위 고지
 * ---------
 * 이 모듈은 `engine.ts`의 가상 반응 그래프를 설정만 바꿔 여러 번 돌리고 그 결과를
 * 나란히 놓고 비교한다. 노드가 응고 생물학의 이름을 빌려 쓰지만 그것은 순전히
 * 라벨일 뿐이고, 여기 있는 어떤 값도 측정값이 아니다. 모든 양은 0–1 무차원이며
 * "외부 입력"은 그래프 바깥에서 한 노드의 수준을 밀어 올리는 조작에 붙인 이름이다.
 * 어떤 상태, 절차, 프로토콜, 제품, 집단에도 대응하지 않는다.
 *
 * 엔진이 결정론적이고 I/O를 하지 않으므로 같은 명세는 언제나 같은 결과를 낸다.
 * 덕분에 이 실행기는 렌더 중에 동기적으로 돌려도 안전하다.
 */
import { ENTITY_DEFINITIONS } from './entities';
import { FIXED_STEP, createDefaultConfig, createEngine } from './engine';
import { clamp01 } from './numeric';
import type { EntityId, SimulationConfig } from './types';

/** 외부 입력을 받을 수 있는 노드. 그래프의 개시점과 중심 출력점이다. */
export type InputTargetId = Extract<EntityId, 'factorIX' | 'thrombin'>;

export const INPUT_TARGETS: readonly InputTargetId[] = ['factorIX', 'thrombin'];

/**
 * - `pulse` — 지정한 모델 시각에 한 번만 더한다.
 * - `sustained` — 지정한 모델 시각부터 관찰이 끝날 때까지 매 스텝 조금씩 더한다.
 *   모델 시간 1단위마다 `amount * SUSTAINED_RATE`만큼 들어가는 셈이다.
 */
export type InputMode = 'pulse' | 'sustained';

/**
 * 지속 입력이 모델 시간 1단위마다 밀어 넣는 양의 배수.
 *
 * 중심 출력 노드의 소실률(0.16)보다 조금 큰 값이라, 최대 세기로 넣으면 그 노드를
 * 척도 위쪽에 붙들어 두지만 척도 중간 세기에서는 붙들지 못한다. 이보다 크면 곡선이
 * 낮은 세기에서 곧장 포화해 쓸어보는 의미가 없어진다.
 */
export const SUSTAINED_RATE = 0.2;

export interface ExternalInputSpec {
  readonly targetId: InputTargetId;
  /** 0–1 무차원 세기. */
  readonly amount: number;
  readonly mode: InputMode;
  /** 입력이 시작되는 모델 시각. */
  readonly atTime: number;
}

export interface ScenarioSpec {
  /** 개시 노드의 공급 설정값 0–1. */
  readonly factorSupply: number;
  readonly externalInput: ExternalInputSpec | null;
  /** 관찰 창의 길이. 추상 모델 시간 단위다. */
  readonly duration: number;
  readonly damageSignal: number;
}

export interface ScenarioSample {
  readonly time: number;
  readonly factorIXa: number;
  readonly factorXa: number;
  readonly thrombin: number;
  readonly fibrin: number;
}

export interface ScenarioOutcome {
  /** 관찰 창 안에서 중심 출력 노드가 도달한 최고 수준. */
  readonly peakThrombin: number;
  /** 중심 출력 노드의 시간 적분을 관찰 창 길이로 나눈 값. 0–1. */
  readonly thrombinIntegral: number;
  /** 관찰 창이 끝나는 순간의 종단 구조 노드 수준. */
  readonly finalFibrin: number;
  /** 종단 구조 노드가 기준선을 넘어선 모델 시각. 끝내 못 넘으면 `null`. */
  readonly timeToThreshold: number | null;
}

export interface ScenarioRun {
  readonly samples: readonly ScenarioSample[];
  readonly outcome: ScenarioOutcome;
}

/** 종단 구조 노드가 이 값을 넘으면 "기준선 도달"로 센다. 임의로 고른 무차원 값이다. */
export const STRUCTURE_THRESHOLD = 0.5;

/** 곡선 하나에 담기는 표본 수의 목표치. 차트가 감당할 만큼으로 솎아 낸다. */
const TARGET_SAMPLE_COUNT = 160;

/** 비교 기준이 되는 개시 노드 공급값. 엔티티 정의의 기본값을 그대로 쓴다. */
export const REFERENCE_FACTOR_SUPPLY: number =
  ENTITY_DEFINITIONS.find((item) => item.id === 'factorIX')?.defaultSupply ?? 0.7;

function buildConfig(spec: ScenarioSpec): SimulationConfig {
  const base = createDefaultConfig();
  return {
    ...base,
    supply: { ...base.supply, factorIX: clamp01(spec.factorSupply) },
    vesselDamageSignal: clamp01(spec.damageSignal),
  };
}

/**
 * 명세 하나를 처음부터 끝까지 돌리고 표본과 요약값을 함께 돌려준다.
 *
 * 엔진의 `levels`는 제자리에서 변경되므로 표본을 뜰 때마다 필요한 값만 복사해 담는다.
 */
export function runScenario(spec: ScenarioSpec): ScenarioRun {
  const engine = createEngine(buildConfig(spec));
  const totalSteps = Math.max(1, Math.round(spec.duration / FIXED_STEP));
  const sampleEvery = Math.max(1, Math.floor(totalSteps / TARGET_SAMPLE_COUNT));

  const input = spec.externalInput;
  const sustainedPerStep =
    input && input.mode === 'sustained'
      ? clamp01(input.amount) * SUSTAINED_RATE * FIXED_STEP
      : 0;
  let pulsePending = input !== null && input.mode === 'pulse';

  const samples: ScenarioSample[] = [];
  let peakThrombin = 0;
  let integral = 0;
  let timeToThreshold: number | null = null;

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

  capture();

  for (let step = 0; step < totalSteps; step += 1) {
    const time = engine.getState().time;

    // 외부 입력은 스텝 이전에 반영한다. 그래야 이번 스텝의 반응이 곧바로 그 값을 본다.
    if (pulsePending && input && time >= input.atTime) {
      engine.applyInput(input.targetId, clamp01(input.amount));
      pulsePending = false;
    }
    if (input && input.mode === 'sustained' && time >= input.atTime && sustainedPerStep > 0) {
      engine.applyInput(input.targetId, sustainedPerStep);
    }

    engine.step();

    const state = engine.getState();
    const thrombin = state.levels.thrombin;
    if (thrombin > peakThrombin) peakThrombin = thrombin;
    integral += thrombin * FIXED_STEP;
    if (timeToThreshold === null && state.levels.fibrin >= STRUCTURE_THRESHOLD) {
      timeToThreshold = state.time;
    }

    if ((step + 1) % sampleEvery === 0) capture();
  }

  const finalState = engine.getState();
  if (samples[samples.length - 1]?.time !== finalState.time) capture();

  const elapsed = totalSteps * FIXED_STEP;
  return {
    samples,
    outcome: {
      peakThrombin: clamp01(peakThrombin),
      thrombinIntegral: clamp01(elapsed > 0 ? integral / elapsed : 0),
      finalFibrin: clamp01(finalState.levels.fibrin),
      timeToThreshold,
    },
  };
}

/**
 * 기준 실행 대비 종단 구조 노드의 도달 비율.
 *
 * 1을 넘는 값을 잘라 내지 않는다. 종단 노드는 중심 출력 노드를 적분하며 쌓이므로
 * 관찰 창이 길면 어지간한 입력이 기준을 넘어서는데, 거기서 상한을 씌우면 서로 다른
 * 설정이 모두 100%로 뭉뚱그려져 쓸어보는 의미가 사라진다.
 *
 * 기준 실행이 아무것도 쌓지 못했다면 비율을 낼 근거가 없으므로 `null`을 돌려준다.
 */
export function structureRatio(
  outcome: ScenarioOutcome,
  reference: ScenarioOutcome,
): number | null {
  if (reference.finalFibrin <= 0) return null;
  return outcome.finalFibrin / reference.finalFibrin;
}

export interface SweepPoint {
  /** 쓸어 본 입력값 0–1. 개시 노드 공급값이거나 외부 입력 세기다. */
  readonly input: number;
  readonly outcome: ScenarioOutcome;
  /** 기준 실행 대비 도달 비율. 기준을 낼 수 없으면 `null`. */
  readonly ratio: number | null;
}

/** 쓸어 볼 지점의 개수. 곡선이 충분히 매끄러우면서 계산이 가벼운 값이다. */
export const SWEEP_STEPS = 21;

function sweepInputs(): readonly number[] {
  return Array.from({ length: SWEEP_STEPS }, (_, index) => index / (SWEEP_STEPS - 1));
}

/**
 * 개시 노드 공급값을 0에서 1까지 쓸어 본다. 외부 입력은 없다.
 * "개시 노드 수준이 다르면 결과가 어떻게 달라지는가"에 대응한다.
 */
export function runFactorSweep(
  spec: Omit<ScenarioSpec, 'factorSupply' | 'externalInput'>,
): readonly SweepPoint[] {
  const reference = runScenario({
    ...spec,
    factorSupply: REFERENCE_FACTOR_SUPPLY,
    externalInput: null,
  }).outcome;

  return sweepInputs().map((input) => {
    const outcome = runScenario({
      ...spec,
      factorSupply: input,
      externalInput: null,
    }).outcome;
    return { input, outcome, ratio: structureRatio(outcome, reference) };
  });
}

/**
 * 외부 입력 세기를 0에서 1까지 쓸어 본다. 개시 노드 공급값은 고정한다.
 * "얼마나 밀어 넣으면 어디까지 되돌아오는가"에 대응한다.
 */
export function runInputSweep(
  spec: Omit<ScenarioSpec, 'externalInput'>,
  input: Omit<ExternalInputSpec, 'amount'>,
): readonly SweepPoint[] {
  const reference = runScenario({
    ...spec,
    factorSupply: REFERENCE_FACTOR_SUPPLY,
    externalInput: null,
  }).outcome;

  return sweepInputs().map((amount) => {
    const outcome = runScenario({
      ...spec,
      externalInput: { ...input, amount },
    }).outcome;
    return { input: amount, outcome, ratio: structureRatio(outcome, reference) };
  });
}
