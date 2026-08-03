'use client';

import { useState } from 'react';
import { ControlPanel } from '@/components/controls/ControlPanel';
import { ENTITY_KIND_LABELS, getEntity } from '@/simulation/entities';
import { formatNormalized } from '@/simulation/numeric';
import {
  STRUCTURE_EVIDENCE_LABELS,
  structureRegistry,
} from '@/molecules/StructureRegistry';
import { rendererFeatureFlags } from '@/rendering/featureFlags';
import { SimulationViewport } from '@/rendering/SimulationViewport';
import { KpiStrip } from '@/components/dashboard/KpiStrip';
import { SceneTextMirror } from '@/components/dashboard/SceneTextMirror';
import { TimelineScrubber } from '@/components/dashboard/TimelineScrubber';
import { TransportBar } from '@/components/dashboard/TransportBar';
import { selectDisplayed, useSimulationStore } from '@/store/simulationStore';

export function SimulationWorkspace() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selectedId = useSimulationStore((state) => state.selectedEntityId);
  const selectedLevel = useSimulationStore((state) =>
    selectedId ? selectDisplayed(state).levels[selectedId] : 0,
  );
  const selected = selectedId ? getEntity(selectedId) : null;
  const descriptor = selectedId ? structureRegistry.resolve(selectedId) : null;

  return (
    <div className="mx-auto flex w-full max-w-[118rem] flex-col gap-3 p-3 sm:p-4 lg:h-full lg:min-h-0">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-accent">실시간 분자 작업공간</p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-ink-0">시뮬레이션</h2>
          </div>
          <span className="hidden rounded-full border border-line bg-surface-1 px-2 py-1 font-mono text-[0.6rem] text-ink-2 sm:inline-flex">
            renderer / {rendererFeatureFlags.simulationRenderer}
          </span>
        </div>
        <button type="button" onClick={() => setSettingsOpen(true)} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs font-semibold text-ink-1 transition hover:border-line-strong hover:bg-surface-3 hover:text-ink-0">
          모델 설정
        </button>
      </div>

      <div className="shrink-0"><KpiStrip /></div>

      <div className="grid min-h-[31rem] flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-h-[31rem]"><SimulationViewport /></div>
        <aside className="hidden min-h-0 flex-col gap-3 xl:flex" aria-label="선택 컨텍스트">
          <section className="rounded-xl border border-line bg-surface-1 p-4">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-2">선택</p>
            {selected ? (
              <>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-0">{selected.label}</p>
                    <p className="mt-1 text-xs leading-5 text-ink-2">{selected.shortCode} · {ENTITY_KIND_LABELS[selected.kind]}</p>
                  </div>
                  <span className="font-mono text-lg" style={{ color: selected.color }}>{selected.glyph}</span>
                </div>
                <div className="mt-4 border-t border-line pt-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[0.68rem] text-ink-2">현재 정규화 수준</span>
                    <span className="font-mono text-sm text-ink-0">{formatNormalized(selectedLevel)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${selectedLevel * 100}%` }} />
                  </div>
                </div>
              </>
            ) : <p className="mt-3 text-xs text-ink-2">선택된 엔티티가 없습니다.</p>}
          </section>

          <section className="rounded-xl border border-line bg-surface-1 p-4">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-2">구조 출처</p>
            <p className="mt-3 text-sm font-semibold text-ink-0">{descriptor?.accession ?? '개념 대체 표시'}</p>
            <p className="mt-1 text-xs leading-5 text-ink-2">{descriptor?.notes ?? '선택된 구조가 없습니다.'}</p>
            <span className={`mt-3 inline-flex rounded-full border px-2 py-1 text-[0.62rem] font-semibold ${descriptor?.evidence === 'experimental' ? 'border-accent/30 bg-accent/10 text-accent' : 'border-caution/30 bg-caution/10 text-caution'}`}>
              {descriptor ? STRUCTURE_EVIDENCE_LABELS[descriptor.evidence] : '자료 없음'}
            </span>
          </section>

          <section className="mt-auto rounded-xl border border-line bg-surface-1 p-4 text-xs leading-5 text-ink-2">
            Mol*은 표시만 담당합니다. 모든 수준, 핵심 신호, 타임라인 snapshot은 기존 SimulationEngine이 계속 소유합니다.
          </section>
        </aside>
      </div>

      <div className="grid shrink-0 gap-3 2xl:grid-cols-[minmax(31rem,0.9fr)_minmax(38rem,1.1fr)]">
        <TransportBar />
        <TimelineScrubber />
      </div>
      <SceneTextMirror showDetails={false} />

      {settingsOpen ? (
        <div className="fixed inset-0 z-40 bg-surface-0/70 backdrop-blur-sm" onMouseDown={() => setSettingsOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="시뮬레이션 설정" className="ml-auto h-full w-full max-w-md border-l border-line bg-surface-1 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div><p className="text-sm font-semibold text-ink-0">모델 설정</p><p className="mt-0.5 text-[0.65rem] text-ink-2">SimulationEngine 파라미터</p></div>
              <button type="button" onClick={() => setSettingsOpen(false)} className="rounded px-2 py-1 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink-0">닫기</button>
            </div>
            <div className="h-[calc(100%-3.5rem)]"><ControlPanel /></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
