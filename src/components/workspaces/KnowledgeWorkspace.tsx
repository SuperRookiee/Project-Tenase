'use client';

import { ENTITY_DEFINITIONS } from '@/simulation/entities';
import { REACTION_DEFINITIONS } from '@/simulation/reactions';
import { useSimulationStore } from '@/store/simulationStore';

const GLOSSARY = [
  ['활성화', '전구 노드가 그래프의 활성형 노드로 전환되는 추상 관계.'],
  ['결합', '두 참여 노드가 하나의 복합체 노드를 만드는 관계.'],
  ['억제', '특정 경로의 활동 또는 노드 수준을 낮추는 조절 관계.'],
  ['snapshot', '특정 모델 시간에 기록한 수준, 신호, 반응 활동의 읽기 전용 복사본.'],
] as const;

export function KnowledgeWorkspace() {
  const openMolecule = useSimulationStore((state) => state.openMoleculeExplorer);
  const selectEntity = useSimulationStore((state) => state.selectEntity);
  const setWorkspace = useSimulationStore((state) => state.setWorkspace);
  return (
    <div className="mx-auto w-full max-w-6xl p-3 sm:p-5">
      <div className="mb-8"><p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-structural">참고 자료실</p><h2 className="mt-1 text-xl font-semibold tracking-tight">지식 자료</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">시뮬레이션 객체와 설명을 오가며 추상 반응 네트워크를 단계적으로 살펴봅니다.</p></div>
      <section className="mb-8"><h3 className="text-sm font-semibold">연쇄 흐름 한눈에 보기</h3><ol className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{['Factor IX → IXa', 'IXa + VIIIa', 'Tenase → FXa', 'FXa → Thrombin', 'Thrombin → Fibrin'].map((step, index) => <li key={step} className="rounded-xl bg-surface-1 p-4"><span className="font-mono text-xs text-accent">0{index + 1}</span><p className="mt-2 text-sm font-medium">{step}</p></li>)}</ol></section>
      <section className="mb-8"><h3 className="text-sm font-semibold">분자 사전</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ENTITY_DEFINITIONS.map((entity) => <button key={entity.id} type="button" onClick={() => openMolecule(entity.id)} className="rounded-xl bg-surface-1 p-4 text-left hover:bg-surface-2"><span className="text-xs" style={{ color: entity.color }}>{entity.glyph} {entity.shortCode}</span><h4 className="mt-2 text-sm font-semibold">{entity.label}</h4><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-2">{entity.role}</p></button>)}</div></section>
      <section className="mb-8"><h3 className="text-sm font-semibold">반응 설명</h3><div className="mt-3 space-y-2">{REACTION_DEFINITIONS.map((reaction) => <button key={reaction.id} type="button" onClick={() => { selectEntity(reaction.products[0]?.entityId ?? reaction.reactants[0]?.entityId ?? null); setWorkspace('reactions'); }} className="block w-full rounded-xl bg-surface-1 p-4 text-left hover:bg-surface-2"><span className="text-sm font-semibold">{reaction.label}</span><p className="mt-1 text-xs leading-relaxed text-ink-2">{reaction.description}</p></button>)}</div></section>
      <section><h3 className="text-sm font-semibold">용어 사전</h3><dl className="mt-3 grid gap-2 sm:grid-cols-2">{GLOSSARY.map(([term, description]) => <div key={term} className="rounded-xl bg-surface-1 p-4"><dt className="text-sm font-semibold">{term}</dt><dd className="mt-1 text-xs leading-relaxed text-ink-2">{description}</dd></div>)}</dl></section>
    </div>
  );
}

