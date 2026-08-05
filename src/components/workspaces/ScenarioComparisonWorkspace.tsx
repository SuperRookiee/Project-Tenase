'use client';

/**
 * 시나리오 비교 작업공간.
 *
 * 범위 고지
 * ---------
 * 여기 있는 모든 곡선은 `engine.ts`의 가상 반응 그래프를 설정만 바꿔 여러 번 돌린
 * 결과다. 노드가 응고 생물학의 이름을 빌려 쓰지만 그것은 순전히 라벨일 뿐이고,
 * 축에 놓인 어떤 값도 측정값이 아니다. 전부 0–1 무차원이며 "외부 입력"은 그래프
 * 바깥에서 한 노드의 수준을 밀어 올리는 조작에 붙인 이름이다. 어떤 상태, 절차,
 * 프로토콜, 제품, 집단에도 대응하지 않는다.
 *
 * 다른 작업공간과 달리 실시간 엔진을 구독하지 않는다. 실행기가 그때그때 새 엔진을
 * 만들어 끝까지 돌린 결과를 보여 주므로, 상단 바의 재생·일시정지와 무관하게 동작한다.
 */
import { useMemo, useState } from 'react';
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
  INPUT_TARGETS,
  REFERENCE_FACTOR_SUPPLY,
  STRUCTURE_THRESHOLD,
  runFactorSweep,
  runInputSweep,
  runScenario,
  structureRatio,
  type InputMode,
  type InputTargetId,
  type ScenarioOutcome,
  type ScenarioRun,
  type SweepPoint,
} from '@/simulation/scenarioSweep';
import { getEntity } from '@/simulation/entities';
import { DEFAULT_DISPLAY_SCALE, formatNormalized } from '@/simulation/numeric';
import { useSimulationStore } from '@/store/simulationStore';

const CHART_HEIGHT = 190;

const INPUT_MODES: readonly { id: InputMode; label: string; hint: string }[] = [
  { id: 'pulse', label: '일회 입력', hint: '지정한 시각에 한 번만 밀어 올린다.' },
  { id: 'sustained', label: '지속 입력', hint: '그 시각부터 관찰이 끝날 때까지 조금씩 계속 밀어 넣는다.' },
];

/** 세 실행을 구분하는 색. 범례에 이름이 함께 적혀 있어 색에만 기대지 않는다. */
const SERIES = {
  reference: { key: 'reference', label: '기준 (개시 노드 기본 공급값)', color: '#5eead4' },
  baseline: { key: 'baseline', label: '현재 공급값 · 외부 입력 없음', color: '#64748b' },
  pushed: { key: 'pushed', label: '현재 공급값 · 외부 입력 있음', color: '#fb923c' },
} as const;

const MIN_DURATION = 8;
const MAX_DURATION = 40;

/** 쓸어보기를 다시 계산하기 전에 설정이 잠잠해지기를 기다리는 시간. */
const SWEEP_SETTLE_MS = 220;

interface MergedSample {
  readonly time: number;
  readonly reference: number;
  readonly baseline: number;
  readonly pushed: number;
}

/**
 * 세 실행의 같은 계열을 하나의 차트 데이터로 합친다.
 *
 * 세 실행은 관찰 창 길이가 같으므로 표본 시각도 같다. 그래도 길이가 어긋나면
 * 가장 짧은 쪽에 맞춰 잘라 낸다 — 없는 표본을 지어내는 것보다 낫다.
 */
function mergeSeries(
  runs: { reference: ScenarioRun; baseline: ScenarioRun; pushed: ScenarioRun },
  pick: (sample: ScenarioRun['samples'][number]) => number,
): readonly MergedSample[] {
  const count = Math.min(
    runs.reference.samples.length,
    runs.baseline.samples.length,
    runs.pushed.samples.length,
  );
  return Array.from({ length: count }, (_, index) => ({
    time: runs.reference.samples[index].time,
    reference: pick(runs.reference.samples[index]),
    baseline: pick(runs.baseline.samples[index]),
    pushed: pick(runs.pushed.samples[index]),
  }));
}

function formatRatio(ratio: number | null): string {
  return ratio === null ? '비교 불가' : `${Math.round(ratio * 100)}%`;
}

function formatArrival(time: number | null): string {
  return time === null ? '창 안에서 미도달' : `t ${time.toFixed(1)}`;
}

function formatPercentTick(value: unknown): string {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : '';
}

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--color-surface-2)',
  border: '1px solid var(--color-line-strong)',
  fontSize: 12,
} as const;

function ComparisonChart({
  title,
  description,
  data,
  domainMax,
  threshold,
}: {
  readonly title: string;
  readonly description: string;
  readonly data: readonly MergedSample[];
  readonly domainMax: number;
  readonly threshold?: number;
}) {
  const reducedMotion = useSimulationStore((state) => state.reducedMotion);
  return (
    <figure className="rounded-xl border border-line bg-surface-1 p-4">
      <figcaption>
        <h3 className="text-sm font-semibold text-ink-0">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{description}</p>
      </figcaption>
      <div className="mt-3" style={{ height: CHART_HEIGHT }} aria-hidden="true">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={data as MergedSample[]} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value: unknown) => (typeof value === 'number' ? value.toFixed(0) : '')}
              tick={{ fill: 'var(--color-ink-2)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-line)' }}
              height={20}
            />
            <YAxis
              domain={[0, domainMax]}
              tickFormatter={(value: unknown) => (typeof value === 'number' ? value.toFixed(2) : '')}
              tick={{ fill: 'var(--color-ink-2)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-line)' }}
              width={38}
            />
            <Tooltip
              isAnimationActive={!reducedMotion}
              formatter={(value: unknown) => (typeof value === 'number' ? formatNormalized(value) : '—')}
              labelFormatter={(label: unknown) => `모델 시간 ${typeof label === 'number' ? label.toFixed(2) : ''}`}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: 'var(--color-ink-1)' }}
              itemStyle={{ color: 'var(--color-ink-0)' }}
            />
            {threshold !== undefined ? (
              <ReferenceLine y={threshold} stroke="var(--color-line-strong)" strokeDasharray="4 4" />
            ) : null}
            {Object.values(SERIES).map((series) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                name={series.label}
                stroke={series.color}
                strokeWidth={series.key === 'pushed' ? 2.4 : 1.8}
                strokeDasharray={series.key === 'baseline' ? '5 4' : undefined}
                dot={false}
                isAnimationActive={!reducedMotion}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {Object.values(SERIES).map((series) => (
          <li key={series.key} className="flex items-center gap-1.5 text-[0.68rem] text-ink-2">
            <span aria-hidden="true" style={{ backgroundColor: series.color }} className="inline-block h-0.5 w-4 rounded-full" />
            {series.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}

function SweepChart({
  title,
  description,
  xLabel,
  lines,
  marker,
}: {
  readonly title: string;
  readonly description: string;
  readonly xLabel: string;
  readonly lines: readonly { key: string; label: string; color: string; points: readonly SweepPoint[] }[];
  readonly marker: number;
}) {
  const reducedMotion = useSimulationStore((state) => state.reducedMotion);
  const data = useMemo(() => {
    const base = lines[0]?.points ?? [];
    return base.map((point, index) => {
      const row: Record<string, number | null> = { input: point.input };
      for (const line of lines) row[line.key] = line.points[index]?.ratio ?? null;
      return row;
    });
  }, [lines]);

  return (
    <figure className="rounded-xl border border-line bg-surface-1 p-4">
      <figcaption>
        <h3 className="text-sm font-semibold text-ink-0">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{description}</p>
      </figcaption>
      <div className="mt-3" style={{ height: CHART_HEIGHT }} aria-hidden="true">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" />
            <XAxis
              dataKey="input"
              type="number"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={formatPercentTick}
              tick={{ fill: 'var(--color-ink-2)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-line)' }}
              height={20}
            />
            <YAxis
              tickFormatter={formatPercentTick}
              tick={{ fill: 'var(--color-ink-2)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-line)' }}
              width={44}
            />
            <Tooltip
              isAnimationActive={!reducedMotion}
              formatter={(value: unknown) => (typeof value === 'number' ? `${Math.round(value * 100)}%` : '—')}
              labelFormatter={(label: unknown) => `${xLabel} ${typeof label === 'number' ? Math.round(label * 100) : ''}%`}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: 'var(--color-ink-1)' }}
              itemStyle={{ color: 'var(--color-ink-0)' }}
            />
            {/* 기준 실행과 같은 높이. 이 선 위쪽은 기준을 넘어섰다는 뜻이다. */}
            <ReferenceLine y={1} stroke="var(--color-line-strong)" strokeDasharray="4 4" />
            <ReferenceLine x={marker} stroke="var(--color-accent)" strokeDasharray="2 3" />
            {lines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={!reducedMotion}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {lines.map((line) => (
          <li key={line.key} className="flex items-center gap-1.5 text-[0.68rem] text-ink-2">
            <span aria-hidden="true" style={{ backgroundColor: line.color }} className="inline-block h-0.5 w-4 rounded-full" />
            {line.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-[0.68rem] text-ink-2">
          <span aria-hidden="true" className="inline-block h-3 w-0.5 rounded-full bg-accent" />
          현재 설정값
        </li>
      </ul>
    </figure>
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
    <div className={`rounded-xl border p-4 ${highlight ? 'border-accent/40 bg-accent/5' : 'border-line bg-surface-1'}`}>
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-2">{label}</p>
      <p className={`mt-1.5 font-mono text-2xl tabular-nums ${highlight ? 'text-accent' : 'text-ink-0'}`}>{value}</p>
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

export function ScenarioComparisonWorkspace() {
  const [factorSupply, setFactorSupply] = useState(0.15);
  const [damageSignal, setDamageSignal] = useState(0.5);
  const [duration, setDuration] = useState(20);
  const [inputTarget, setInputTarget] = useState<InputTargetId>('factorIX');
  const [inputMode, setInputMode] = useState<InputMode>('pulse');
  const [inputAmount, setInputAmount] = useState(0.4);
  /** 표시 전용. `null`이면 0–1 소수로 읽는다. 실행에 들어가는 값은 언제나 0–1이다. */
  const [displayScale, setDisplayScale] = useState<number | null>(DEFAULT_DISPLAY_SCALE);
  const [inputTime, setInputTime] = useState(2);

  const clampedInputTime = Math.min(inputTime, duration);
  const observation = useMemo(() => ({ duration, damageSignal }), [duration, damageSignal]);

  const runs = useMemo(
    () => ({
      reference: runScenario({ ...observation, factorSupply: REFERENCE_FACTOR_SUPPLY, externalInput: null }),
      baseline: runScenario({ ...observation, factorSupply, externalInput: null }),
      pushed: runScenario({
        ...observation,
        factorSupply,
        externalInput: { targetId: inputTarget, amount: inputAmount, mode: inputMode, atTime: clampedInputTime },
      }),
    }),
    [observation, factorSupply, inputTarget, inputAmount, inputMode, clampedInputTime],
  );

  // 쓸어보기는 한 번에 실행을 스무 번 넘게 돌리므로 슬라이더를 끄는 동안 매 입력마다
  // 다시 계산하면 화면이 멎는다. 위 세 실행은 가벼우니 즉시 따라가게 두고, 쓸어보기만
  // 값이 잠잠해진 뒤에 따라잡게 한다.
  const settled = useDebouncedValue(
    useMemo(
      () => ({ observation, factorSupply, inputTarget, atTime: clampedInputTime }),
      [observation, factorSupply, inputTarget, clampedInputTime],
    ),
    SWEEP_SETTLE_MS,
  );

  // 개시 노드 쓸어보기는 외부 입력 설정과 무관하다. 의존성을 좁혀 두면 입력 쪽을
  // 만질 때 이 계산이 다시 돌지 않는다.
  const factorSweep = useMemo(() => runFactorSweep(settled.observation), [settled.observation]);

  // 세기가 곧 가로축이므로 세기 슬라이더는 의존성에서 빠진다.
  const inputSweeps = useMemo(
    () =>
      INPUT_MODES.map((mode) => ({
        key: mode.id,
        label: mode.label,
        color: mode.id === 'pulse' ? '#fb923c' : '#a78bfa',
        points: runInputSweep(
          { ...settled.observation, factorSupply: settled.factorSupply },
          { targetId: settled.inputTarget, mode: mode.id, atTime: settled.atTime },
        ),
      })),
    [settled],
  );

  const referenceOutcome: ScenarioOutcome = runs.reference.outcome;
  const baselineRatio = structureRatio(runs.baseline.outcome, referenceOutcome);
  const pushedRatio = structureRatio(runs.pushed.outcome, referenceOutcome);
  const targetEntity = getEntity(inputTarget);
  const factorEntity = getEntity('factorIX');
  const modeLabel = INPUT_MODES.find((mode) => mode.id === inputMode)?.label ?? '';

  const thrombinData = useMemo(() => mergeSeries(runs, (sample) => sample.thrombin), [runs]);
  const fibrinData = useMemo(() => mergeSeries(runs, (sample) => sample.fibrin), [runs]);
  const thrombinMax = useMemo(
    () => Math.max(0.2, ...thrombinData.flatMap((row) => [row.reference, row.baseline, row.pushed])),
    [thrombinData],
  );

  return (
    <div className="mx-auto w-full max-w-[100rem] p-3 sm:p-5">
      <WorkspaceHeader
        eyebrow="시나리오 비교"
        title="개시 노드와 회복 곡선"
        inputTerm="외부 입력"
        description="개시 노드(Factor IX)의 공급값을 바꿔 가며 중심 출력 노드(Thrombin)가 얼마나 만들어지는지, 종단 구조 노드(Fibrin)가 어디까지 쌓이는지, 그리고 노드를 밖에서 밀어 올렸을 때 기준 실행에 얼마나 가까워지는지를 비교합니다."
      />

      <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <section aria-label="시나리오 설정" className="flex flex-col gap-4">
          <div className="rounded-xl border border-line bg-surface-1 p-4">
            <h3 className="text-sm font-semibold">반응망 상태</h3>
            <div className="mt-3 flex flex-col gap-4">
              <DisplayScaleSelect
                id="scenario-display-scale"
                value={displayScale}
                onChange={setDisplayScale}
                description="공급값과 입력 세기 슬라이더를 소수 대신 정수로 읽고 쓰기 위한 기준이다. 저장되는 값은 바뀌지 않는다."
              />
              <NormalizedSlider
                id="scenario-factor-supply"
                label="개시 노드 공급값"
                value={factorSupply}
                onChange={setFactorSupply}
                accentColor={factorEntity.color}
                glyph={factorEntity.glyph}
                shortCode={factorEntity.shortCode}
                displayScale={displayScale ?? undefined}
                description={`Factor IX 노드가 머무는 수준. 기준 실행은 ${formatNormalized(REFERENCE_FACTOR_SUPPLY, 2)}을 쓴다.`}
              />
              <NormalizedSlider
                id="scenario-damage"
                label="손상 개시 신호"
                value={damageSignal}
                onChange={setDamageSignal}
                description="개시 엣지를 여는 추상 신호. 0이면 연쇄가 시작되지 않는다."
              />
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="scenario-duration" className="text-xs font-semibold text-ink-0">
                    관찰 창 길이
                  </label>
                  <span aria-hidden="true" className="font-mono text-xs tabular-nums text-ink-1">
                    {duration}
                  </span>
                </div>
                <input
                  id="scenario-duration"
                  type="range"
                  min={MIN_DURATION}
                  max={MAX_DURATION}
                  step={1}
                  value={duration}
                  aria-valuetext={`모델 시간 ${duration}단위`}
                  aria-describedby="scenario-duration-description"
                  onChange={(event) => setDuration(Number(event.target.value))}
                  className="h-4 w-full cursor-pointer accent-accent"
                />
                <p id="scenario-duration-description" className="text-[0.7rem] leading-snug text-ink-2">
                  각 실행을 얼마나 오래 돌릴지. 창이 길수록 종단 노드가 척도 위쪽에
                  몰려 설정 사이의 차이가 줄어든다.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface-1 p-4">
            <h3 className="text-sm font-semibold">외부 입력</h3>
            <p className="mt-1 text-[0.7rem] leading-snug text-ink-2">
              고른 노드의 수준을 그래프 바깥에서 밀어 올린다. 그 뒤로는 그 노드의 평소
              거동이 그대로 이어진다.
            </p>

            <fieldset className="mt-3">
              <legend className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-2">대상 노드</legend>
              <div className="mt-2 flex gap-1 rounded-lg bg-surface-0/70 p-1">
                {INPUT_TARGETS.map((id) => {
                  const entity = getEntity(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={inputTarget === id}
                      onClick={() => setInputTarget(id)}
                      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${inputTarget === id ? 'bg-surface-3 text-ink-0' : 'text-ink-2 hover:bg-surface-2'}`}
                    >
                      <span aria-hidden="true" className="mr-1" style={{ color: entity.color }}>{entity.glyph}</span>
                      {entity.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="mt-3">
              <legend className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-2">방식</legend>
              <div className="mt-2 flex gap-1 rounded-lg bg-surface-0/70 p-1">
                {INPUT_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={inputMode === mode.id}
                    onClick={() => setInputMode(mode.id)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${inputMode === mode.id ? 'bg-surface-3 text-ink-0' : 'text-ink-2 hover:bg-surface-2'}`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[0.7rem] leading-snug text-ink-2">
                {INPUT_MODES.find((mode) => mode.id === inputMode)?.hint}
              </p>
            </fieldset>

            <div className="mt-4 flex flex-col gap-4">
              <NormalizedSlider
                id="scenario-input-amount"
                label="입력 세기"
                value={inputAmount}
                onChange={setInputAmount}
                accentColor={targetEntity.color}
                glyph={targetEntity.glyph}
                shortCode={targetEntity.shortCode}
                displayScale={displayScale ?? undefined}
                description="0이면 밀어 올리지 않은 것과 완전히 같다."
              />
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="scenario-input-time" className="text-xs font-semibold text-ink-0">
                    입력 시각
                  </label>
                  <span aria-hidden="true" className="font-mono text-xs tabular-nums text-ink-1">
                    t {clampedInputTime.toFixed(1)}
                  </span>
                </div>
                <input
                  id="scenario-input-time"
                  type="range"
                  min={0}
                  max={duration}
                  step={0.5}
                  value={clampedInputTime}
                  aria-valuetext={`모델 시간 ${clampedInputTime.toFixed(1)}`}
                  onChange={(event) => setInputTime(Number(event.target.value))}
                  className="h-4 w-full cursor-pointer accent-accent"
                />
              </div>
            </div>
          </div>
        </section>

        <section aria-label="비교 결과" className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <OutcomeCard
              label="도달 비율 · 입력 있음"
              value={formatRatio(pushedRatio)}
              detail="기준 실행이 관찰 창 끝에 쌓아 둔 종단 구조 노드를 100%로 놓았을 때의 비율이다."
              highlight
            />
            <OutcomeCard
              label="도달 비율 · 입력 없음"
              value={formatRatio(baselineRatio)}
              detail="같은 공급값에서 아무것도 밀어 올리지 않았을 때. 위 값과의 차이가 외부 입력이 만든 변화다."
            />
            <OutcomeCard
              label="최고 Thrombin"
              value={formatNormalized(runs.pushed.outcome.peakThrombin, 3)}
              detail={`입력 없이는 ${formatNormalized(runs.baseline.outcome.peakThrombin, 3)}, 기준 실행은 ${formatNormalized(referenceOutcome.peakThrombin, 3)}.`}
            />
            <OutcomeCard
              label="기준선 도달 시각"
              value={formatArrival(runs.pushed.outcome.timeToThreshold)}
              detail={`종단 구조 노드가 ${formatNormalized(STRUCTURE_THRESHOLD, 2)}을 넘어선 시각. 입력 없이는 ${formatArrival(runs.baseline.outcome.timeToThreshold)}.`}
            />
          </div>

          <div className="grid gap-4 2xl:grid-cols-2">
            <ComparisonChart
              title="Thrombin 생성 경과"
              description="개시 엣지가 열린 뒤 중심 출력 노드가 어떻게 올라갔다 내려오는지. 세로축은 0–1 무차원이다."
              data={thrombinData}
              domainMax={Math.min(1, Math.ceil(thrombinMax * 10) / 10)}
            />
            <ComparisonChart
              title="종단 구조 노드 축적"
              description="Fibrin 노드가 쌓이는 모양. 가로 점선이 기준선이고, 곡선이 그 위로 올라가면 기준선 도달로 센다."
              data={fibrinData}
              domainMax={1}
              threshold={STRUCTURE_THRESHOLD}
            />
            <SweepChart
              title="개시 노드 공급값에 따른 도달 비율"
              description="외부 입력 없이 공급값만 0에서 100%까지 바꿔 가며 매번 끝까지 돌린 결과다."
              xLabel="개시 노드 공급값"
              lines={[{ key: 'factor', label: '외부 입력 없음', color: '#5eead4', points: factorSweep }]}
              marker={factorSupply}
            />
            <SweepChart
              title={`${targetEntity.label} 입력 세기에 따른 도달 비율`}
              description="현재 공급값을 고정한 채 입력 세기만 쓸어본 결과다. 가로 점선(100%)은 기준 실행과 같은 높이를 뜻한다."
              xLabel="입력 세기"
              lines={inputSweeps}
              marker={inputAmount}
            />
          </div>

          <div className="rounded-xl border border-line bg-surface-1 p-4">
            <h3 className="text-sm font-semibold">현재 설정 요약</h3>
            <p className="mt-1 text-[0.7rem] leading-snug text-ink-2">
              위 그림과 같은 값을 글로 적어 둔 것이다. 그림 자체는 보조 기술에서 숨겨져 있다.
            </p>
            <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <SummaryRow term="개시 노드 공급값" value={formatNormalized(factorSupply, 2)} />
              <SummaryRow term="손상 개시 신호" value={formatNormalized(damageSignal, 2)} />
              <SummaryRow
                term="외부 입력"
                value={`${targetEntity.shortCode} · ${modeLabel} · ${formatNormalized(inputAmount, 2)} · t ${clampedInputTime.toFixed(1)}`}
              />
              <SummaryRow term="관찰 창 길이" value={String(duration)} />
              <SummaryRow term="도달 비율 · 입력 있음" value={formatRatio(pushedRatio)} />
              <SummaryRow term="도달 비율 · 입력 없음" value={formatRatio(baselineRatio)} />
              <SummaryRow
                term="누적 Thrombin · 입력 있음"
                value={formatNormalized(runs.pushed.outcome.thrombinIntegral, 3)}
              />
              <SummaryRow
                term="누적 Thrombin · 입력 없음"
                value={formatNormalized(runs.baseline.outcome.thrombinIntegral, 3)}
              />
              <SummaryRow
                term="종단 구조 노드 · 입력 있음"
                value={formatNormalized(runs.pushed.outcome.finalFibrin, 3)}
              />
              <SummaryRow term="종단 구조 노드 · 기준" value={formatNormalized(referenceOutcome.finalFibrin, 3)} />
            </dl>
          </div>
        </section>
      </div>
    </div>
  );
}
