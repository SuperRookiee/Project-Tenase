'use client';

/**
 * 실행 제어와 대표 판독값.
 *
 * 여기 있는 모든 숫자는 무차원이다. `time`은 현실의 초가 아니라 추상 모델 시간
 * 단위를 센다.
 */
import { selectDisplayed, useSimulationStore } from '@/store/simulationStore';

const BUTTON_BASE =
  'rounded border px-3 py-1.5 text-sm font-semibold transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

interface ReadoutProps {
  readonly label: string;
  readonly value: string;
}

function Readout({ label, value }: ReadoutProps) {
  return (
    <div className="flex flex-col">
      <dt className="text-[0.65rem] uppercase tracking-wide text-ink-2">{label}</dt>
      <dd className="font-mono text-sm text-ink-0">{value}</dd>
    </div>
  );
}

export function TransportBar() {
  const running = useSimulationStore((state) => state.running);
  const toggleRunning = useSimulationStore((state) => state.toggleRunning);
  const stepOnce = useSimulationStore((state) => state.stepOnce);
  const reset = useSimulationStore((state) => state.reset);

  // 좁은 원시값 선택자들. 각각 숫자나 불리언을 반환하므로, 래퍼 객체가 새로
  // 할당됐다는 이유만으로 컴포넌트가 다시 렌더링되지 않는다.
  const tick = useSimulationStore((state) => selectDisplayed(state).tick);
  const time = useSimulationStore((state) => selectDisplayed(state).time);
  const isHistorical = useSimulationStore(
    (state) => selectDisplayed(state).isHistorical,
  );
  const reactionEventCount = useSimulationStore(
    (state) => selectDisplayed(state).signals.reactionEventCount,
  );
  const modeLabel = isHistorical ? '기록 재생' : running ? '실시간' : '일시정지';

  return (
    <section
      aria-labelledby="transport-heading"
      className="rounded-lg border border-line bg-surface-1 p-3"
    >
      <h2 id="transport-heading" className="sr-only">
        실행 제어
      </h2>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleRunning}
            aria-pressed={running}
            className={`${BUTTON_BASE} border-accent-dim bg-accent-dim/30 text-ink-0 hover:bg-accent-dim/50`}
          >
            {running ? '일시정지' : isHistorical ? '실시간 재생' : '재생'}
          </button>
          <button
            type="button"
            onClick={stepOnce}
            disabled={running || isHistorical}
            title={running ? '먼저 일시정지한 뒤 정확히 한 interval을 진행한다.' : '정확히 한 고정 interval을 진행하고 일시정지 상태를 유지한다.'}
            className={`${BUTTON_BASE} border-line-strong bg-surface-2 text-ink-0 hover:bg-surface-3`}
          >
            한 interval 진행
          </button>
          <button
            type="button"
            onClick={reset}
            className={`${BUTTON_BASE} border-caution/60 bg-caution/10 text-caution hover:bg-caution/20`}
          >
            네트워크 초기화
          </button>
        </div>

        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Readout label="틱" value={String(tick)} />
          <Readout label="모델 시간 단위" value={time.toFixed(2)} />
          <Readout label="반응 이벤트 수" value={String(reactionEventCount)} />
        </dl>

        <p
          className={`ml-auto rounded border px-2 py-1 text-xs font-semibold ${
            isHistorical
              ? 'border-caution bg-caution/15 text-caution'
              : 'border-line bg-surface-2 text-ink-2'
          }`}
        >
          {modeLabel}
        </p>
      </div>

      <p className="mt-2 text-xs text-ink-2">
        한 interval 진행은 일시정지 상태에서 정확히 한 고정 구간만큼 나아간다. 속도
        슬라이더는 재생 중 모델 시간의 진행 배율에만 영향을 주며, 한 번에 나아가는
        구간의 크기는 바꾸지 않는다.
      </p>
    </section>
  );
}
