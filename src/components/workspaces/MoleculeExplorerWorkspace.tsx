'use client';

import { ENTITY_DEFINITIONS, ENTITY_KIND_LABELS, getEntity } from '@/simulation/entities';
import { MoleculeProvider, useMolecule } from '@/molecules/MoleculeProvider';
import { useSimulationStore } from '@/store/simulationStore';

function MetadataPanel() {
  const molecule = useMolecule();
  const entity = getEntity(molecule.entityId);
  const sections = [
    ['도메인', molecule.domains],
    ['활성 부위', molecule.activeSites],
    ['기능 영역', molecule.functionalRegions],
    ['참여하는 복합체', molecule.knownComplexes],
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl bg-surface-1 p-4">
        <div className="flex items-center gap-3"><span className="text-xl" style={{ color: entity.color }}>{entity.glyph}</span><div><h3 className="font-semibold">{molecule.label}</h3><p className="text-xs text-ink-2">{ENTITY_KIND_LABELS[entity.kind]} · {entity.shortCode}</p></div></div>
        <p className="mt-3 text-sm leading-relaxed text-ink-1">{molecule.summary}</p>
      </section>
      {sections.map(([title, values]) => <section key={title} className="rounded-xl bg-surface-1 p-4"><h3 className="text-xs font-semibold uppercase tracking-wider text-ink-2">{title}</h3><ul className="mt-2 space-y-1.5 text-sm text-ink-1">{values.map((value) => <li key={value}>{value}</li>)}</ul></section>)}
      <section className="rounded-xl border border-dashed border-line bg-surface-1/40 p-4 text-xs leading-relaxed text-ink-2">
        이 시뮬레이션 노드는 추상 모델입니다. 구조·도메인 주석은 accession 검토 후 StructureProvider를 통해 연결되며 임의로 추정하지 않습니다.
      </section>
    </div>
  );
}

export function MoleculeExplorerWorkspace() {
  const selectedEntityId = useSimulationStore((state) => state.selectedEntityId) ?? 'thrombin';
  const selectEntity = useSimulationStore((state) => state.selectEntity);
  return (
    <MoleculeProvider entityId={selectedEntityId}>
      <div className="mx-auto w-full max-w-[110rem] p-3 sm:p-5">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-activation">구조 작업공간</p><h2 className="mt-1 text-xl font-semibold tracking-tight">분자 탐색기</h2></div>
          <label className="text-xs text-ink-2">분자 선택 <select value={selectedEntityId} onChange={(event) => selectEntity(event.target.value as typeof selectedEntityId)} className="ml-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-0">{ENTITY_DEFINITIONS.map((entity) => <option key={entity.id} value={entity.id}>{entity.label}</option>)}</select></label>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(19rem,0.65fr)]">
          <section aria-labelledby="molstar-heading"><div className="mb-2 flex items-center justify-between"><h3 id="molstar-heading" className="text-sm font-semibold">구조 뷰포트</h3><span className="rounded-full bg-surface-2 px-2 py-1 text-[0.65rem] text-ink-2">Phase 5</span></div><div className="grid min-h-[32rem] place-items-center rounded-xl border border-dashed border-line bg-surface-1/50 p-8 text-center"><div className="max-w-md"><p className="text-sm font-semibold text-ink-0">분자 탐색기는 아직 활성화되지 않았습니다.</p><p className="mt-2 text-xs leading-5 text-ink-2">이번 Phase 1–2에서는 공용 Mol* context를 시뮬레이션 작업공간에만 초기화합니다. 표현 방식 조절, 도메인 선택, 출처 탐색은 Phase 5에서 연결됩니다.</p></div></div></section>
          <MetadataPanel />
        </div>
      </div>
    </MoleculeProvider>
  );
}
