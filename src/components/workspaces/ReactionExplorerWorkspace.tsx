'use client';

import { useMemo, useState } from 'react';
import { ANALYSIS_EVENT_LABELS, ANALYSIS_SOURCE_LABELS, buildAnalysisEvents, type AnalysisEvent, type AnalysisEventKind } from '@/analysis/eventModel';
import { getEntity } from '@/simulation/entities';
import { REACTION_DEFINITIONS } from '@/simulation/reactions';
import { getReactionTrace } from '@/simulation/reactionTrace';
import { useSimulationStore } from '@/store/simulationStore';

const FILTERS: readonly AnalysisEventKind[] = ['activation', 'binding', 'complex-formation', 'dissociation', 'inhibition', 'decay', 'reaction'];

function EventList({ events, selectedId, onSelect }: { readonly events: readonly AnalysisEvent[]; readonly selectedId: string | null; onSelect(event: AnalysisEvent): void }) {
  return (
    <ol className="flex max-h-[32rem] flex-col gap-1 overflow-y-auto pr-1">
      {events.map((event) => (
        <li key={event.id}>
          <button type="button" onClick={() => onSelect(event)} aria-pressed={selectedId === event.id} className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${selectedId === event.id ? 'bg-accent-dim/25 text-ink-0' : 'hover:bg-surface-2'}`}>
            <span className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-ink-1">{ANALYSIS_EVENT_LABELS[event.kind]}</span>
              <span className="font-mono text-[0.65rem] text-ink-2">t {event.time.toFixed(2)}</span>
            </span>
            <span className="mt-1 block text-sm text-ink-0">{event.label}</span>
          </button>
        </li>
      ))}
      {events.length === 0 ? <li className="rounded-lg border border-dashed border-line p-5 text-center text-sm text-ink-2">이 필터에 해당하는 기록이 아직 없습니다.</li> : null}
    </ol>
  );
}

export function ReactionExplorerWorkspace() {
  const events = useSimulationStore((state) => state.frame.events);
  const snapshots = useSimulationStore((state) => state.frame.snapshots);
  const selectedEntityId = useSimulationStore((state) => state.selectedEntityId);
  const setScrubIndex = useSimulationStore((state) => state.setScrubIndex);
  const selectEntity = useSimulationStore((state) => state.selectEntity);
  const startStory = useSimulationStore((state) => state.startCameraStory);
  const setWorkspace = useSimulationStore((state) => state.setWorkspace);
  const [filters, setFilters] = useState<ReadonlySet<AnalysisEventKind>>(() => new Set(FILTERS));
  const analysisEvents = useMemo(() => buildAnalysisEvents(events, snapshots), [events, snapshots]);
  const visibleEvents = analysisEvents.filter((event) => filters.has(event.kind));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = analysisEvents.find((event) => event.id === selectedId) ?? visibleEvents[0] ?? null;
  const trace = getReactionTrace(selectedEntityId ?? 'thrombin');

  function replay(event: AnalysisEvent): void {
    if (event.sampleIndex !== null) setScrubIndex(event.sampleIndex);
    const target = event.participants[event.participants.length - 1];
    if (target) {
      selectEntity(target);
      startStory(target);
    }
    setWorkspace('simulation');
  }

  return (
    <div className="mx-auto w-full max-w-[110rem] p-3 sm:p-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-binding">인과 분석</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">반응 탐색기</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">공유 엔진의 이벤트와 스냅샷을 선택·필터·재생합니다.</p>
        </div>
        {selected ? <button type="button" onClick={() => replay(selected)} className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-surface-0 hover:brightness-110">선택 반응 재생</button> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]">
        <section className="rounded-xl bg-surface-1 p-4 shadow-sm" aria-labelledby="reaction-timeline-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 id="reaction-timeline-heading" className="text-sm font-semibold">반응 타임라인</h3>
            <span className="font-mono text-xs text-ink-2">이벤트 {analysisEvents.length}건</span>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5" aria-label="이벤트 필터">
            {FILTERS.map((kind) => (
              <button key={kind} type="button" aria-pressed={filters.has(kind)} onClick={() => setFilters((current) => { const next = new Set(current); if (next.has(kind)) next.delete(kind); else next.add(kind); return next; })} className={`rounded-full px-2.5 py-1 text-[0.68rem] font-semibold ${filters.has(kind) ? 'bg-surface-4 text-ink-0' : 'bg-surface-0 text-ink-2'}`}>
                {ANALYSIS_EVENT_LABELS[kind]}
              </button>
            ))}
          </div>
          <EventList events={visibleEvents} selectedId={selected?.id ?? null} onSelect={(event) => setSelectedId(event.id)} />
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl bg-surface-1 p-4">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-ink-2">선택한 이벤트</p>
            {selected ? <>
              <h3 className="mt-2 text-base font-semibold">{selected.label}</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-ink-2">모델 시간</dt><dd className="mt-1 font-mono">{selected.time.toFixed(2)}</dd></div>
                <div><dt className="text-ink-2">출처</dt><dd className="mt-1">{ANALYSIS_SOURCE_LABELS[selected.source]}</dd></div>
                <div className="col-span-2"><dt className="text-ink-2">참여 노드</dt><dd className="mt-1">{selected.participants.map((id) => getEntity(id).label).join(' · ')}</dd></div>
              </dl>
            </> : <p className="mt-2 text-sm text-ink-2">이벤트를 선택하세요.</p>}
          </section>
          <section className="rounded-xl bg-surface-1 p-4">
            <h3 className="text-sm font-semibold">상류 반응 경로</h3>
            <ol className="mt-3 flex flex-col gap-1.5">
              {[...trace.entityIds].map((id, index) => <li key={id} className="flex items-center gap-2 text-sm"><span className="grid h-6 w-6 place-items-center rounded-full bg-surface-3 font-mono text-[0.65rem] text-accent">{index + 1}</span><span>{getEntity(id).label}</span></li>)}
            </ol>
          </section>
          <section className="rounded-xl bg-surface-1 p-4">
            <h3 className="text-sm font-semibold">반응 목록</h3>
            <ul className="mt-3 space-y-2 text-xs text-ink-1">
              {REACTION_DEFINITIONS.map((reaction) => <li key={reaction.id} className="rounded-md bg-surface-0/60 px-2.5 py-2">{reaction.label}</li>)}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
