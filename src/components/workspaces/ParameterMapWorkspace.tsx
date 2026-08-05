'use client';

/**
 * 파라미터 지도 작업공간.
 *
 * 범위 고지
 * ---------
 * 이 화면의 모든 칸은 `engine.ts`의 가상 반응 그래프를 설정만 바꿔 끝까지 돌린 결과다.
 * 노드가 응고 생물학의 이름을 빌려 쓰지만 그것은 순전히 라벨일 뿐이고, 두 축에 놓인
 * 어떤 값도 측정값이 아니다. 전부 0–1 무차원이며 "보충 입력"은 그래프 바깥에서 한
 * 노드의 수준을 밀어 올리는 조작에 붙인 이름이다. 어떤 상태, 절차, 프로토콜, 제품,
 * 집단에도 대응하지 않는다.
 *
 * 시나리오 비교와 마찬가지로 실시간 엔진을 구독하지 않는다. 실행기가 그때그때 새
 * 엔진을 만들어 끝까지 돌린 결과를 보여 주므로 상단 바의 재생·일시정지와 무관하다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DisplayScaleSelect } from '@/components/controls/DisplayScaleSelect';
import { NormalizedSlider } from '@/components/controls/NormalizedSlider';
import { WorkspaceHeader } from '@/components/dashboard/WorkspaceHeader';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  DEFAULT_PRESET_ID,
  SCENARIO_PRESETS,
  buildPresetConfig,
  getPreset,
  type PresetId,
} from '@/presets/scenarios';
import { getEntity } from '@/simulation/entities';
import { DEFAULT_DISPLAY_SCALE, formatNormalized } from '@/simulation/numeric';
import {
  MAP_AXES,
  MAP_METRICS,
  MAP_RESOLUTION,
  MAX_PLAN_COUNT,
  PLAN_TARGETS,
  applyAxis,
  axisValueAt,
  computeMapRow,
  createBaseSpec,
  getMapAxis,
  getMapMetric,
  readAxis,
  runTrace,
  washoutHalfTime,
  type InputPlan,
  type MapAxis,
  type MapAxisId,
  type MapCell,
  type MapMetricId,
  type MapRunSpec,
  type PlanMode,
} from '@/simulation/parameterMap';
import { STRUCTURE_THRESHOLD } from '@/simulation/scenarioSweep';
import type { EntityId } from '@/simulation/types';
import { useSimulationStore } from '@/store/simulationStore';

const CHART_HEIGHT = 200;
const MIN_DURATION = 8;
const MAX_DURATION = 40;

/** 지도를 다시 계산하기 전에 설정이 잠잠해지기를 기다리는 시간. */
const MAP_SETTLE_MS = 200;

const PLAN_MODES: readonly { id: PlanMode; label: string; hint: string }[] = [
  { id: 'pulse', label: '일회', hint: '지정한 시각에 한 번만 밀어 올린다.' },
  {
    id: 'sustained',
    label: '지속',
    hint: '그 시각부터 관찰이 끝날 때까지 매 스텝 조금씩 넣는다.',
  },
  {
    id: 'repeated',
    label: '반복',
    hint: '그 시각부터 일정 간격으로 정해진 횟수만큼 같은 양을 넣는다.',
  },
];

/**
 * 지도 색 눈금. 어두운 남색에서 밝은 청록으로 가며 밝기가 단조롭게 오르므로, 색을
 * 구분하기 어려워도 짙고 옅음으로 읽힌다. 색만으로 뜻이 실리지 않도록 범례가 양 끝의
 * 뜻을 글로 적고, 고른 칸의 값은 숫자로도 나온다.
 */
const RAMP: readonly (readonly [number, number, number])[] = [
  [0x13, 0x1b, 0x2c],
  [0x1b, 0x4d, 0x63],
  [0x1d, 0x9c, 0x94],
  [0x7d, 0xf1, 0xd8],
];

function rampColor(value: number): string {
  const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
  const span = RAMP.length - 1;
  const position = clamped * span;
  const index = Math.min(span - 1, Math.floor(position));
  const alpha = position - index;
  const from = RAMP[index];
  const to = RAMP[index + 1];
  const channel = (channelIndex: number): number =>
    Math.round(from[channelIndex] + (to[channelIndex] - from[channelIndex]) * alpha);
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

/** 해당 없음으로 남은 칸. 색이 아니라 빗금으로 구분해 눈금과 섞이지 않게 한다. */
const BLANK_FILL = 'var(--color-surface-1)';

/**
 * 이 작업공간이 열릴 때의 출발점.
 *
 * 중립적인 프리셋을 쓴다. 지도에 올라간 두 축은 어차피 0에서 1까지 쓸리므로, 배경까지
 * 한쪽으로 기울여 두면 평면에서 읽히는 것이 축 때문인지 배경 때문인지 가려내기 어려워진다.
 * 배경을 기울여 보고 싶으면 프리셋을 바꾸면 된다.
 */
const DEFAULT_MAP_PRESET: PresetId = DEFAULT_PRESET_ID;

/**
 * 프리셋 하나가 정하는 고정 설정 한 벌.
 *
 * 시뮬레이션 작업공간과 같은 프리셋 정의를 그대로 읽으므로, 두 화면이 같은 이름 아래
 * 같은 출발점을 쓴다. 유지 축은 프리셋이 다루지 않는 값이라 0에서 시작한다.
 */
function presetFixedValues(id: PresetId): Record<string, number> {
  const config = buildPresetConfig(id);
  const values: Record<string, number> = {};
  for (const axis of MAP_AXES) {
    if (axis.kind === 'signal') {
      values[axis.id] = config.vesselDamageSignal;
    } else if (axis.kind === 'supply') {
      values[axis.id] = config.supply[axis.entityId];
    } else {
      values[axis.id] = 0;
    }
  }
  return values;
}

/** 반감 시간을 표시용으로 적는다. 단위는 언제나 추상 모델 시간이다. */
function formatHalfTime(id: EntityId): string {
  const half = washoutHalfTime(id);
  return half === null ? '저절로 줄지 않음' : `모델 시간 ${half.toFixed(1)}단위`;
}

/**
 * 지도를 한 줄씩 채운다.
 *
 * 격자 하나가 수백 번의 실행이라 한 번에 끝내면 화면이 눈에 띄게 멎는다. 줄마다
 * 애니메이션 프레임을 하나씩 쓰면 그 사이에 브라우저가 그림을 갱신할 수 있어, 지도가
 * 위에서 아래로 차오르는 모습이 그대로 보인다.
 */
function useProgressiveMap(
  base: MapRunSpec,
  xAxis: MapAxis,
  yAxis: MapAxis,
  resolution: number,
): readonly MapCell[] {
  const [cells, setCells] = useState<readonly MapCell[]>([]);
  const frameRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const collected: MapCell[] = [];

    // 직전 지도를 여기서 비우지 않는다. 첫 줄이 나오는 순간 통째로 교체되므로 빈 격자가
    // 한 프레임 스쳐 지나가는 일이 없고, 효과 본문에서 상태를 건드리지도 않는다.
    const step = (yIndex: number): void => {
      if (cancelled) return;
      collected.push(...computeMapRow(base, xAxis, yAxis, yIndex, resolution));
      setCells(collected.slice());
      if (yIndex + 1 < resolution) {
        frameRef.current = window.requestAnimationFrame(() => step(yIndex + 1));
      }
    };

    frameRef.current = window.requestAnimationFrame(() => step(0));
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameRef.current);
    };
  }, [base, xAxis, yAxis, resolution]);

  return cells;
}

function AxisSelect({
  id,
  label,
  value,
  exclude,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: MapAxisId;
  readonly exclude: MapAxisId;
  readonly onChange: (next: MapAxisId) => void;
}) {
  const axis = getMapAxis(value);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-ink-0">
        {label}
      </label>
      <select
        id={id}
        value={value}
        aria-describedby={`${id}-description`}
        onChange={(event) => onChange(event.target.value as MapAxisId)}
        className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink-0"
      >
        {MAP_AXES.filter((option) => option.id !== exclude).map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <p id={`${id}-description`} className="text-[0.7rem] leading-snug text-ink-2">
        {axis.description}
      </p>
    </div>
  );
}

function OutcomeCard({
  label,
  value,
  detail,
  highlight = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${highlight ? 'border-accent/40 bg-accent/5' : 'border-line bg-surface-1'}`}
    >
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-2">
        {label}
      </p>
      <p
        className={`mt-1.5 font-mono text-2xl tabular-nums ${highlight ? 'text-accent' : 'text-ink-0'}`}
      >
        {value}
      </p>
      <p className="mt-1 text-[0.68rem] leading-snug text-ink-2">{detail}</p>
    </div>
  );
}

function SummaryRow({ term, value }: { readonly term: string; readonly value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
      <dt className="text-xs text-ink-2">{term}</dt>
      <dd className="font-mono text-xs tabular-nums text-ink-0">{value}</dd>
    </div>
  );
}

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--color-surface-2)',
  border: '1px solid var(--color-line-strong)',
  fontSize: 12,
} as const;

export function ParameterMapWorkspace() {
  const reducedMotion = useSimulationStore((state) => state.reducedMotion);

  const [xAxisId, setXAxisId] = useState<MapAxisId>('factorIX');
  const [yAxisId, setYAxisId] = useState<MapAxisId>('antithrombin');
  const [metricId, setMetricId] = useState<MapMetricId>('finalFibrin');
  const [duration, setDuration] = useState(20);
  const [presetId, setPresetId] = useState<PresetId>(DEFAULT_MAP_PRESET);
  const [fixed, setFixed] = useState<Readonly<Record<string, number>>>(() =>
    presetFixedValues(DEFAULT_MAP_PRESET),
  );
  /** 표시 전용. `null`이면 0–1 소수로 읽는다. 격자에 들어가는 값은 언제나 0–1이다. */
  const [displayScale, setDisplayScale] = useState<number | null>(DEFAULT_DISPLAY_SCALE);
  const [xIndex, setXIndex] = useState(Math.floor(MAP_RESOLUTION / 2));
  const [yIndex, setYIndex] = useState(Math.floor(MAP_RESOLUTION / 2));

  const [planEnabled, setPlanEnabled] = useState(false);
  const [planTarget, setPlanTarget] = useState<InputPlan['targetId']>('factorIX');
  const [planMode, setPlanMode] = useState<PlanMode>('repeated');
  const [planAmount, setPlanAmount] = useState(0.35);
  const [planAtTime, setPlanAtTime] = useState(2);
  const [planInterval, setPlanInterval] = useState(4);
  const [planCount, setPlanCount] = useState(4);

  const xAxis = getMapAxis(xAxisId);
  const yAxis = getMapAxis(yAxisId);
  const metric = getMapMetric(metricId);
  const clampedAtTime = Math.min(planAtTime, duration);

  /** 고정 설정이 아직 프리셋 그대로인지. 벗어났으면 설명에 그렇게 적는다. */
  const presetMatches = useMemo(() => {
    const values = presetFixedValues(presetId);
    return MAP_AXES.every(
      (axis) => Math.abs((fixed[axis.id] ?? axis.defaultValue) - values[axis.id]) < 1e-9,
    );
  }, [presetId, fixed]);

  /** 지도에 올라가지 않아 값이 고정되는 축들. 왼쪽 패널에서 직접 만진다. */
  const fixedAxes = useMemo(
    () => MAP_AXES.filter((axis) => axis.id !== xAxisId && axis.id !== yAxisId),
    [xAxisId, yAxisId],
  );

  const plan = useMemo<InputPlan | null>(
    () =>
      planEnabled
        ? {
            targetId: planTarget,
            amount: planAmount,
            mode: planMode,
            atTime: clampedAtTime,
            interval: planInterval,
            count: planCount,
          }
        : null,
    [planEnabled, planTarget, planAmount, planMode, clampedAtTime, planInterval, planCount],
  );

  /** 두 축을 뺀 나머지 설정을 모두 반영한 바탕 명세. 축 값은 칸마다 덧씌워진다. */
  const base = useMemo(() => {
    let spec: MapRunSpec = { ...createBaseSpec(), duration, plan };
    for (const axis of fixedAxes) {
      spec = applyAxis(spec, axis, fixed[axis.id] ?? axis.defaultValue);
    }
    return spec;
  }, [duration, plan, fixedAxes, fixed]);

  // 지도는 한 번에 수백 번의 실행이므로 슬라이더를 끄는 동안 매 입력마다 다시 계산하면
  // 화면이 계속 덜컹인다. 값이 잠잠해진 뒤에 따라잡게 한다.
  const settled = useDebouncedValue(base, MAP_SETTLE_MS);
  const cells = useProgressiveMap(settled, xAxis, yAxis, MAP_RESOLUTION);

  const filledRows = Math.floor(cells.length / MAP_RESOLUTION);
  const complete = filledRows >= MAP_RESOLUTION;

  const selectedX = axisValueAt(xIndex, MAP_RESOLUTION);
  const selectedY = axisValueAt(yIndex, MAP_RESOLUTION);

  /** 고른 칸의 명세. 지도와 같은 바탕에서 두 축 값만 얹는다. */
  const selectedSpec = useMemo(
    () => applyAxis(applyAxis(settled, yAxis, selectedY), xAxis, selectedX),
    [settled, xAxis, yAxis, selectedX, selectedY],
  );
  /** 같은 칸에서 보충 입력만 걷어낸 명세. 계획이 무엇을 바꿨는지 견주는 기준이다. */
  const plainSpec = useMemo<MapRunSpec>(
    () => ({ ...selectedSpec, plan: null }),
    [selectedSpec],
  );

  const selectedTrace = useMemo(() => runTrace(selectedSpec), [selectedSpec]);
  const plainTrace = useMemo(() => runTrace(plainSpec), [plainSpec]);

  const chartData = useMemo(() => {
    const count = Math.min(selectedTrace.samples.length, plainTrace.samples.length);
    return Array.from({ length: count }, (_, index) => ({
      time: selectedTrace.samples[index].time,
      withPlan: selectedTrace.samples[index].fibrin,
      withoutPlan: plainTrace.samples[index].fibrin,
      thrombin: selectedTrace.samples[index].thrombin,
    }));
  }, [selectedTrace, plainTrace]);

  const selectedOutcome = selectedTrace.outcome;
  const plainOutcome = plainTrace.outcome;
  const planTargetEntity = getEntity(planTarget);
  const planModeLabel = PLAN_MODES.find((mode) => mode.id === planMode)?.label ?? '';

  const cellSize = 100 / MAP_RESOLUTION;

  return (
    <div className="mx-auto w-full max-w-[100rem] p-3 sm:p-5">
      <WorkspaceHeader
        eyebrow="파라미터 지도"
        title="두 설정이 겹쳐 만드는 평면"
        inputTerm="보충 입력"
        description="축 두 개를 골라 0에서 1까지 격자로 쓸어 보고, 칸마다 반응망을 끝까지 돌린 결과를 색으로 칠합니다. 축 하나를 따라 곡선을 그리는 시나리오 비교와 달리 평면 전체를 보므로, 한쪽을 낮춘 것을 다른 쪽으로 얼마나 메울 수 있는지가 한눈에 드러납니다."
      />

      <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <section aria-label="지도 설정" className="flex flex-col gap-4">
          <div className="rounded-xl border border-line bg-surface-1 p-4">
            <h3 className="text-sm font-semibold">지도 축</h3>
            <div className="mt-3 flex flex-col gap-4">
              <AxisSelect
                id="map-x-axis"
                label="가로축"
                value={xAxisId}
                exclude={yAxisId}
                onChange={setXAxisId}
              />
              <AxisSelect
                id="map-y-axis"
                label="세로축"
                value={yAxisId}
                exclude={xAxisId}
                onChange={setYAxisId}
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="map-metric" className="text-xs font-semibold text-ink-0">
                  칠할 결과값
                </label>
                <select
                  id="map-metric"
                  value={metricId}
                  aria-describedby="map-metric-description"
                  onChange={(event) => setMetricId(event.target.value as MapMetricId)}
                  className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink-0"
                >
                  {MAP_METRICS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p
                  id="map-metric-description"
                  className="text-[0.7rem] leading-snug text-ink-2"
                >
                  {metric.description}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface-1 p-4">
            <h3 className="text-sm font-semibold">보충 입력 계획</h3>
            <p className="mt-1 text-[0.7rem] leading-snug text-ink-2">
              고른 노드를 그래프 바깥에서 밀어 올린다. 그 뒤로는 그 노드의 평소 거동이
              그대로 이어지므로, 저장형 노드는 공급값 쪽으로 완화되고 일시형 노드는
              감쇠한다.
            </p>

            <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-ink-0">
              <input
                type="checkbox"
                checked={planEnabled}
                onChange={(event) => setPlanEnabled(event.target.checked)}
                className="size-4 accent-accent"
              />
              계획을 지도에 반영
            </label>

            <div className={planEnabled ? 'mt-3' : 'mt-3 opacity-50'}>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="map-plan-target"
                  className="text-xs font-semibold text-ink-0"
                >
                  대상 노드
                </label>
                <select
                  id="map-plan-target"
                  value={planTarget}
                  disabled={!planEnabled}
                  onChange={(event) =>
                    setPlanTarget(event.target.value as InputPlan['targetId'])
                  }
                  className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink-0 disabled:cursor-not-allowed"
                >
                  {PLAN_TARGETS.map((id) => (
                    <option key={id} value={id}>
                      {getEntity(id).label}
                    </option>
                  ))}
                </select>
                <p className="text-[0.7rem] leading-snug text-ink-2">
                  이 노드에 넣은 값은 다른 엣지를 모두 빼고 그 노드의 기본 회전량만 놓고
                  보면 <strong className="font-semibold text-ink-1">
                    {formatHalfTime(planTarget)}
                  </strong>마다 절반으로 줄어든다. 추상 모델 시간이며 실제 시간으로 옮기는
                  환산은 이 프로젝트에 없다.
                </p>
              </div>

              <fieldset className="mt-3" disabled={!planEnabled}>
                <legend className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-2">
                  방식
                </legend>
                <div className="mt-2 flex gap-1 rounded-lg bg-surface-0/70 p-1">
                  {PLAN_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      aria-pressed={planMode === mode.id}
                      onClick={() => setPlanMode(mode.id)}
                      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                        planMode === mode.id
                          ? 'bg-surface-3 text-ink-0'
                          : 'text-ink-2 hover:bg-surface-2'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[0.7rem] leading-snug text-ink-2">
                  {PLAN_MODES.find((mode) => mode.id === planMode)?.hint}
                </p>
              </fieldset>

              <div className="mt-4 flex flex-col gap-4">
                <NormalizedSlider
                  id="map-plan-amount"
                  label="입력 세기"
                  value={planAmount}
                  onChange={setPlanAmount}
                  disabled={!planEnabled}
                  accentColor={planTargetEntity.color}
                  glyph={planTargetEntity.glyph}
                  shortCode={planTargetEntity.shortCode}
                  displayScale={displayScale ?? undefined}
                  description="0이면 밀어 올리지 않은 것과 완전히 같다."
                />

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <label
                      htmlFor="map-plan-at-time"
                      className="text-xs font-semibold text-ink-0"
                    >
                      첫 입력 시각
                    </label>
                    <span
                      aria-hidden="true"
                      className="font-mono text-xs tabular-nums text-ink-1"
                    >
                      t {clampedAtTime.toFixed(1)}
                    </span>
                  </div>
                  <input
                    id="map-plan-at-time"
                    type="range"
                    min={0}
                    max={duration}
                    step={0.5}
                    value={clampedAtTime}
                    disabled={!planEnabled}
                    aria-valuetext={`모델 시간 ${clampedAtTime.toFixed(1)}`}
                    onChange={(event) => setPlanAtTime(Number(event.target.value))}
                    className="h-4 w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
                  />
                </div>

                {planMode === 'repeated' ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <label
                          htmlFor="map-plan-interval"
                          className="text-xs font-semibold text-ink-0"
                        >
                          입력 간격
                        </label>
                        <span
                          aria-hidden="true"
                          className="font-mono text-xs tabular-nums text-ink-1"
                        >
                          {planInterval.toFixed(1)}
                        </span>
                      </div>
                      <input
                        id="map-plan-interval"
                        type="range"
                        min={0.5}
                        max={12}
                        step={0.5}
                        value={planInterval}
                        disabled={!planEnabled}
                        aria-valuetext={`모델 시간 ${planInterval.toFixed(1)}단위마다`}
                        aria-describedby="map-plan-interval-description"
                        onChange={(event) => setPlanInterval(Number(event.target.value))}
                        className="h-4 w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
                      />
                      <p
                        id="map-plan-interval-description"
                        className="text-[0.7rem] leading-snug text-ink-2"
                      >
                        위 반감 시간보다 촘촘하면 앞서 넣은 값이 다 빠지기 전에 다음
                        입력이 겹쳐 쌓이고, 성기면 사이에서 도로 내려앉는다.
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <label
                          htmlFor="map-plan-count"
                          className="text-xs font-semibold text-ink-0"
                        >
                          입력 횟수
                        </label>
                        <span
                          aria-hidden="true"
                          className="font-mono text-xs tabular-nums text-ink-1"
                        >
                          {planCount}
                        </span>
                      </div>
                      <input
                        id="map-plan-count"
                        type="range"
                        min={1}
                        max={MAX_PLAN_COUNT}
                        step={1}
                        value={planCount}
                        disabled={!planEnabled}
                        aria-describedby="map-plan-count-description"
                        aria-valuetext={`${planCount}회`}
                        onChange={(event) => setPlanCount(Number(event.target.value))}
                        className="h-4 w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
                      />
                      <p
                        id="map-plan-count-description"
                        className="text-[0.7rem] leading-snug text-ink-2"
                      >
                        관찰 창을 넘어가는 입력은 버린다. 창이 짧으면 뒤쪽 몇 번은 아예
                        들어가지 않는다.
                      </p>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface-1 p-4">
            <h3 className="text-sm font-semibold">고정 설정</h3>
            <p className="mt-1 text-[0.7rem] leading-snug text-ink-2">
              지도에 올리지 않은 나머지 값이다. 격자를 도는 동안 이 값들은 그대로 유지된다.
            </p>

            <div className="mt-3">
              <DisplayScaleSelect
                id="map-display-scale"
                value={displayScale}
                onChange={setDisplayScale}
                description="공급값과 입력 세기 슬라이더를 소수 대신 정수로 읽고 쓰기 위한 기준이다. 저장되는 값도 지도도 바뀌지 않는다."
              />
            </div>

            <div className="mt-4 flex flex-col gap-1.5">
              <label htmlFor="map-preset" className="text-xs font-semibold text-ink-0">
                출발점 프리셋
              </label>
              <select
                id="map-preset"
                value={presetId}
                aria-describedby="map-preset-description"
                onChange={(event) => {
                  const next = event.target.value as PresetId;
                  setPresetId(next);
                  setFixed(presetFixedValues(next));
                }}
                className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink-0"
              >
                {SCENARIO_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <p
                id="map-preset-description"
                className="text-[0.7rem] leading-snug text-ink-2"
              >
                {getPreset(presetId).description}
                {presetMatches ? '' : ' 아래 슬라이더를 옮겨 프리셋에서 벗어난 상태다.'}
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="map-duration" className="text-xs font-semibold text-ink-0">
                  관찰 창 길이
                </label>
                <span
                  aria-hidden="true"
                  className="font-mono text-xs tabular-nums text-ink-1"
                >
                  {duration}
                </span>
              </div>
              <input
                id="map-duration"
                type="range"
                min={MIN_DURATION}
                max={MAX_DURATION}
                step={1}
                value={duration}
                aria-valuetext={`모델 시간 ${duration}단위`}
                onChange={(event) => setDuration(Number(event.target.value))}
                className="h-4 w-full cursor-pointer accent-accent"
              />
            </div>

            <div className="mt-4 flex flex-col gap-4">
              {fixedAxes.map((axis) => {
                const entity = axis.entityId ? getEntity(axis.entityId) : null;
                return (
                  <NormalizedSlider
                    key={axis.id}
                    id={`map-fixed-${axis.id}`}
                    label={axis.label}
                    value={fixed[axis.id] ?? axis.defaultValue}
                    onChange={(next) =>
                      setFixed((current) => ({ ...current, [axis.id]: next }))
                    }
                    accentColor={entity?.color}
                    glyph={entity?.glyph}
                    shortCode={entity?.shortCode}
                    // 개시 신호는 노드에 담긴 양이 아니라 엣지를 여는 세기다. 양을 세는
                    // 기준을 거기에 씌우면 읽는 사람을 헷갈리게 하므로 소수로 남긴다.
                    displayScale={
                      axis.kind === 'signal' ? undefined : (displayScale ?? undefined)
                    }
                  />
                );
              })}
            </div>
          </div>
        </section>

        <section aria-label="지도 결과" className="flex min-w-0 flex-col gap-4">
          <figure className="rounded-xl border border-line bg-surface-1 p-4">
            <figcaption>
              <h3 className="text-sm font-semibold text-ink-0">{metric.label}</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-2">
                가로축은 {xAxis.label}, 세로축은 {yAxis.label}. 두 축 모두 왼쪽 아래가 0,
                오른쪽 위가 1이다.{' '}
                {complete
                  ? `격자 ${MAP_RESOLUTION}×${MAP_RESOLUTION}칸을 모두 계산했다.`
                  : `계산 중 — ${filledRows}/${MAP_RESOLUTION}줄.`}
              </p>
            </figcaption>

            <div className="mt-3 flex gap-2">
              <div
                aria-hidden="true"
                className="flex w-6 shrink-0 items-center justify-center"
              >
                <span className="whitespace-nowrap text-[0.62rem] text-ink-2 [writing-mode:vertical-rl] [transform:rotate(180deg)]">
                  {yAxis.shortLabel} 0 → 1
                </span>
              </div>

              <div className="min-w-0 flex-1">
                {/* 그림은 보조 기술에서 숨긴다. 같은 내용을 아래 결과 카드와 요약
                    표가 글로 적고, 칸 고르기는 두 범위 입력이 담당한다. */}
                <svg
                  viewBox={`0 0 100 100`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  className="aspect-square w-full rounded-lg border border-line bg-surface-0"
                >
                  {cells.map((cell) => {
                    const value = metric.select(cell.outcome, settled.duration);
                    return (
                      <rect
                        key={`${cell.xIndex}-${cell.yIndex}`}
                        x={cell.xIndex * cellSize}
                        y={(MAP_RESOLUTION - 1 - cell.yIndex) * cellSize}
                        width={cellSize}
                        height={cellSize}
                        fill={value === null ? BLANK_FILL : rampColor(value)}
                      />
                    );
                  })}
                  <rect
                    x={xIndex * cellSize}
                    y={(MAP_RESOLUTION - 1 - yIndex) * cellSize}
                    width={cellSize}
                    height={cellSize}
                    fill="none"
                    stroke="var(--color-caution)"
                    strokeWidth={1.2}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>

                <div
                  aria-hidden="true"
                  className="mt-1 flex justify-between text-[0.62rem] text-ink-2"
                >
                  <span>0</span>
                  <span>{xAxis.shortLabel}</span>
                  <span>1</span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-24 rounded-full"
                  style={{
                    backgroundImage: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(0.34)}, ${rampColor(0.67)}, ${rampColor(1)})`,
                  }}
                />
                <span className="text-[0.68rem] text-ink-2">
                  옅을수록 {metric.higherIsFurther ? '작은' : '큰'} 값, 짙을수록{' '}
                  {metric.higherIsFurther ? '큰' : '작은'} 값
                </span>
              </div>
              <span className="text-[0.68rem] text-ink-2">
                <span
                  aria-hidden="true"
                  className="mr-1.5 inline-block size-2.5 rounded-sm border border-caution align-middle"
                />
                고른 칸
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor="map-cell-x"
                    className="text-xs font-semibold text-ink-0"
                  >
                    고른 칸 · 가로 위치
                  </label>
                  <span
                    aria-hidden="true"
                    className="font-mono text-xs tabular-nums text-ink-1"
                  >
                    {formatNormalized(selectedX, 2)}
                  </span>
                </div>
                <input
                  id="map-cell-x"
                  type="range"
                  min={0}
                  max={MAP_RESOLUTION - 1}
                  step={1}
                  value={xIndex}
                  aria-valuetext={`${xAxis.label} ${formatNormalized(selectedX, 2)}`}
                  onChange={(event) => setXIndex(Number(event.target.value))}
                  className="h-4 w-full cursor-pointer accent-accent"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor="map-cell-y"
                    className="text-xs font-semibold text-ink-0"
                  >
                    고른 칸 · 세로 위치
                  </label>
                  <span
                    aria-hidden="true"
                    className="font-mono text-xs tabular-nums text-ink-1"
                  >
                    {formatNormalized(selectedY, 2)}
                  </span>
                </div>
                <input
                  id="map-cell-y"
                  type="range"
                  min={0}
                  max={MAP_RESOLUTION - 1}
                  step={1}
                  value={yIndex}
                  aria-valuetext={`${yAxis.label} ${formatNormalized(selectedY, 2)}`}
                  onChange={(event) => setYIndex(Number(event.target.value))}
                  className="h-4 w-full cursor-pointer accent-accent"
                />
              </div>
            </div>
          </figure>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <OutcomeCard
              label="고른 칸 · 결과값"
              value={metric.format(selectedOutcome)}
              detail={`${xAxis.shortLabel} ${formatNormalized(selectedX, 2)}, ${yAxis.shortLabel} ${formatNormalized(selectedY, 2)}에서의 ${metric.label}.`}
              highlight
            />
            <OutcomeCard
              label="기준선 미달 구간"
              value={`${Math.round(selectedOutcome.shortfallFraction * 100)}%`}
              detail={
                planEnabled
                  ? `보충 입력을 걷어내면 ${Math.round(plainOutcome.shortfallFraction * 100)}%.`
                  : '종단 구조 노드가 기준선 아래에 머문 관찰 창의 비율이다.'
              }
            />
            <OutcomeCard
              label="최고 Thrombin"
              value={formatNormalized(selectedOutcome.peakThrombin, 3)}
              detail={
                planEnabled
                  ? `보충 입력을 걷어내면 ${formatNormalized(plainOutcome.peakThrombin, 3)}.`
                  : '관찰 창 안에서 중심 출력 노드가 도달한 최고 수준이다.'
              }
            />
            <OutcomeCard
              label="기준선 도달 시각"
              value={
                selectedOutcome.timeToThreshold === null
                  ? '미도달'
                  : `t ${selectedOutcome.timeToThreshold.toFixed(1)}`
              }
              detail={
                planEnabled
                  ? `보충 입력을 걷어내면 ${plainOutcome.timeToThreshold === null ? '미도달' : `t ${plainOutcome.timeToThreshold.toFixed(1)}`}.`
                  : `종단 구조 노드가 ${formatNormalized(STRUCTURE_THRESHOLD, 2)}을 넘어선 시각이다.`
              }
            />
          </div>

          <figure className="rounded-xl border border-line bg-surface-1 p-4">
            <figcaption>
              <h3 className="text-sm font-semibold text-ink-0">고른 칸의 경과</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-2">
                고른 칸을 그대로 돌렸을 때 종단 구조 노드가 쌓이는 모양이다. 가로 점선이
                기준선이고, 보충 입력을 켜면 같은 칸에서 계획을 걷어낸 곡선이 함께
                그려진다.
              </p>
            </figcaption>
            <div className="mt-3" style={{ height: CHART_HEIGHT }} aria-hidden="true">
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <LineChart
                  data={chartData}
                  margin={{ top: 6, right: 10, bottom: 0, left: 0 }}
                >
                  <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(value: unknown) =>
                      typeof value === 'number' ? value.toFixed(0) : ''
                    }
                    tick={{ fill: 'var(--color-ink-2)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--color-line)' }}
                    height={20}
                  />
                  <YAxis
                    domain={[0, 1]}
                    tickFormatter={(value: unknown) =>
                      typeof value === 'number' ? value.toFixed(2) : ''
                    }
                    tick={{ fill: 'var(--color-ink-2)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--color-line)' }}
                    width={38}
                  />
                  <Tooltip
                    isAnimationActive={!reducedMotion}
                    formatter={(value: unknown) =>
                      typeof value === 'number' ? formatNormalized(value) : '—'
                    }
                    labelFormatter={(label: unknown) =>
                      `모델 시간 ${typeof label === 'number' ? label.toFixed(2) : ''}`
                    }
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: 'var(--color-ink-1)' }}
                    itemStyle={{ color: 'var(--color-ink-0)' }}
                  />
                  <ReferenceLine
                    y={STRUCTURE_THRESHOLD}
                    stroke="var(--color-line-strong)"
                    strokeDasharray="4 4"
                  />
                  <Line
                    type="monotone"
                    dataKey="withPlan"
                    name="Fibrin · 현재 설정"
                    stroke="#f43f5e"
                    strokeWidth={2.4}
                    dot={false}
                    isAnimationActive={!reducedMotion}
                  />
                  {planEnabled ? (
                    <Line
                      type="monotone"
                      dataKey="withoutPlan"
                      name="Fibrin · 보충 입력 없음"
                      stroke="#64748b"
                      strokeWidth={1.8}
                      strokeDasharray="5 4"
                      dot={false}
                      isAnimationActive={!reducedMotion}
                    />
                  ) : null}
                  <Line
                    type="monotone"
                    dataKey="thrombin"
                    name="Thrombin · 현재 설정"
                    stroke="#fb923c"
                    strokeWidth={1.8}
                    dot={false}
                    isAnimationActive={!reducedMotion}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <li className="flex items-center gap-1.5 text-[0.68rem] text-ink-2">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: '#f43f5e' }}
                  className="inline-block h-0.5 w-4 rounded-full"
                />
                Fibrin · 현재 설정
              </li>
              {planEnabled ? (
                <li className="flex items-center gap-1.5 text-[0.68rem] text-ink-2">
                  <span
                    aria-hidden="true"
                    style={{ backgroundColor: '#64748b' }}
                    className="inline-block h-0.5 w-4 rounded-full"
                  />
                  Fibrin · 보충 입력 없음
                </li>
              ) : null}
              <li className="flex items-center gap-1.5 text-[0.68rem] text-ink-2">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: '#fb923c' }}
                  className="inline-block h-0.5 w-4 rounded-full"
                />
                Thrombin · 현재 설정
              </li>
            </ul>
          </figure>

          <div className="rounded-xl border border-line bg-surface-1 p-4">
            <h3 className="text-sm font-semibold">현재 설정 요약</h3>
            <p className="mt-1 text-[0.7rem] leading-snug text-ink-2">
              위 그림과 같은 값을 글로 적어 둔 것이다. 그림 자체는 보조 기술에서 숨겨져
              있다.
            </p>
            <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <SummaryRow term="가로축" value={`${xAxis.label} · ${formatNormalized(selectedX, 2)}`} />
              <SummaryRow term="세로축" value={`${yAxis.label} · ${formatNormalized(selectedY, 2)}`} />
              <SummaryRow term="칠한 결과값" value={metric.label} />
              <SummaryRow term="관찰 창 길이" value={String(duration)} />
              <SummaryRow
                term="보충 입력"
                value={
                  planEnabled
                    ? `${planTargetEntity.shortCode} · ${planModeLabel} · ${formatNormalized(planAmount, 2)} · t ${clampedAtTime.toFixed(1)}${planMode === 'repeated' ? ` · ${planInterval.toFixed(1)} 간격 · ${planCount}회` : ''}`
                    : '없음'
                }
              />
              <SummaryRow
                term="격자"
                value={`${MAP_RESOLUTION}×${MAP_RESOLUTION} · ${complete ? '계산 완료' : `${filledRows}줄 완료`}`}
              />
              <SummaryRow
                term="종단 구조 노드 · 현재"
                value={formatNormalized(selectedOutcome.finalFibrin, 3)}
              />
              <SummaryRow
                term="종단 구조 노드 · 보충 입력 없음"
                value={formatNormalized(plainOutcome.finalFibrin, 3)}
              />
              <SummaryRow
                term="평균 Thrombin · 현재"
                value={formatNormalized(selectedOutcome.meanThrombin, 3)}
              />
              <SummaryRow
                term="평균 Thrombin · 보충 입력 없음"
                value={formatNormalized(plainOutcome.meanThrombin, 3)}
              />
              <SummaryRow
                term="기준선 미달 구간 · 현재"
                value={`${Math.round(selectedOutcome.shortfallFraction * 100)}%`}
              />
              <SummaryRow
                term="기준선 미달 구간 · 보충 입력 없음"
                value={`${Math.round(plainOutcome.shortfallFraction * 100)}%`}
              />
            </dl>

            {/* 지도가 실제로 어떤 바탕 위에서 돌았는지. 슬라이더가 아니라 계산에 쓰인
                명세에서 읽으므로, 설정을 만지는 동안에도 그려진 지도와 어긋나지 않는다. */}
            <h4 className="mt-5 text-xs font-semibold text-ink-1">고정 설정 값</h4>
            <p className="mt-1 text-[0.68rem] leading-snug text-ink-2">
              출발점 프리셋 &ldquo;{getPreset(presetId).name}&rdquo;
              {presetMatches ? ' 그대로다.' : '에서 손으로 옮긴 상태다.'}
            </p>
            <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {fixedAxes.map((axis) => (
                <SummaryRow
                  key={axis.id}
                  term={axis.label}
                  value={formatNormalized(readAxis(settled, axis), 2)}
                />
              ))}
            </dl>
          </div>
        </section>
      </div>
    </div>
  );
}
