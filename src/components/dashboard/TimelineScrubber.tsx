'use client';

/**
 * 타임라인 검토 컨트롤.
 *
 * 엔진은 용량이 고정된 스냅샷 링을 메모리에 유지한다. 이 컨트롤은 그 링 위에서
 * 커서를 옮긴다. 샘플을 고르면 실행이 일시정지되므로 보고 있는 화면이 아래에서
 * 미끄러지지 않는다. 어디에도 기록되는 것은 없다.
 */
import { useSimulationStore } from '@/store/simulationStore';

export function TimelineScrubber() {
  const snapshots = useSimulationStore((state) => state.frame.snapshots);
  const scrubIndex = useSimulationStore((state) => state.scrubIndex);
  const setScrubIndex = useSimulationStore((state) => state.setScrubIndex);
  const running = useSimulationStore((state) => state.running);

  const length = snapshots.length;
  const hasHistory = length > 0;
  const maxIndex = hasHistory ? length - 1 : 0;
  // 실시간 보기는 가장 최근 기록 샘플 위에 놓인다.
  const activeIndex = scrubIndex ?? maxIndex;
  const selected = hasHistory ? snapshots[activeIndex] : undefined;
  const isLive = scrubIndex === null;
  const mode = !isLive ? '기록 snapshot 재생' : running ? '실시간' : '일시정지';

  const positionText = hasHistory
    ? `샘플 ${length}개 중 ${activeIndex + 1}번째${
        isLive ? ', 가장 최근 기록 샘플, 실시간 네트워크를 따라가는 중' : ''
      }${
        selected
          ? `, 틱 ${selected.tick}, ${selected.time.toFixed(2)} 모델 시간 단위`
          : ''
      }`
    : '아직 기록된 샘플이 없음';

  return (
    <section
      aria-labelledby="timeline-heading"
      className="rounded-lg border border-line bg-surface-1 p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="timeline-heading"
          className="text-sm font-semibold uppercase tracking-wide text-ink-1"
        >
          타임라인
        </h2>
        <div className="flex items-center gap-2">
          <span className={`rounded border px-2 py-1 text-xs font-semibold ${!isLive ? 'border-caution/60 bg-caution/10 text-caution' : running ? 'border-accent-dim bg-accent-dim/20 text-accent' : 'border-line-strong bg-surface-2 text-ink-1'}`}>
            {mode}
          </span>
          <button
            type="button"
            onClick={() => setScrubIndex(null)}
            disabled={isLive}
            className="rounded border border-line-strong bg-surface-2 px-2 py-1 text-xs font-semibold text-ink-0 transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            실시간으로 복귀
          </button>
        </div>
      </div>

      <label
        htmlFor="timeline-scrubber"
        className="mt-2 block text-xs text-ink-2"
      >
        기록 샘플 위치
      </label>
      <input
        id="timeline-scrubber"
        type="range"
        min={0}
        max={maxIndex}
        step={1}
        value={activeIndex}
        disabled={!hasHistory}
        onChange={(event) => setScrubIndex(Number(event.target.value))}
        aria-valuetext={positionText}
        aria-describedby="timeline-readout"
        className="mt-1 w-full accent-accent disabled:cursor-not-allowed disabled:opacity-50"
      />

      <p id="timeline-readout" className="mt-2 font-mono text-xs text-ink-1">
        {hasHistory ? (
          <>
            <span>{`샘플 ${activeIndex + 1} / ${length}`}</span>
            {selected ? (
              <span>
                {` · 틱 ${selected.tick} · ${selected.time.toFixed(
                  2,
                )} 모델 시간 단위 · 이벤트 ${selected.signals.reactionEventCount}`}
              </span>
            ) : null}
            <span className="text-ink-2">
              {` · ${mode}`}
            </span>
          </>
        ) : (
          <span className="text-ink-2">
            아직 기록된 샘플이 없다. 네트워크를 잠시 실행해 보라.
          </span>
        )}
      </p>
    </section>
  );
}
