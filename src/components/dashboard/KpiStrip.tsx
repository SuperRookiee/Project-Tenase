'use client';

import { getEntity } from '@/simulation/entities';
import type { DerivedSignals } from '@/simulation/types';
import { formatNormalized, formatPercentOfScale } from '@/simulation/numeric';
import { selectDisplayed, useSimulationStore } from '@/store/simulationStore';

export const KPI_DEFINITIONS: ReadonlyArray<{
  readonly label: string;
  readonly signal: keyof Pick<
    DerivedSignals,
    | 'factorIXModelSignal'
    | 'factorXaModelSignal'
    | 'thrombinModelSignal'
    | 'fibrinModelSignal'
    | 'inhibitionModelSignal'
  >;
  readonly entityId: 'factorIXa' | 'factorXa' | 'thrombin' | 'fibrin' | 'antithrombin';
}> = [
  { label: 'Factor IX 신호', signal: 'factorIXModelSignal', entityId: 'factorIXa' },
  { label: 'Factor Xa 신호', signal: 'factorXaModelSignal', entityId: 'factorXa' },
  { label: 'Thrombin 신호', signal: 'thrombinModelSignal', entityId: 'thrombin' },
  { label: 'Fibrin 신호', signal: 'fibrinModelSignal', entityId: 'fibrin' },
  { label: '억제 신호', signal: 'inhibitionModelSignal', entityId: 'antithrombin' },
];

function KpiCard({ definition }: { readonly definition: (typeof KPI_DEFINITIONS)[number] }) {
  const value = useSimulationStore(
    (state) => selectDisplayed(state).signals[definition.signal],
  );
  const entity = getEntity(definition.entityId);

  return (
    <li className="min-w-32 flex-1 rounded-lg border border-line/80 bg-surface-1 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[0.68rem] font-semibold text-ink-2">
        <span aria-hidden="true" className="font-mono" style={{ color: entity.color }}>
          {entity.glyph}
        </span>
        <span>{definition.label}</span>
      </div>
      <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-ink-0">
        {formatNormalized(value, 2)}
      </p>
      <p className="text-[0.62rem] text-ink-2">{formatPercentOfScale(value)}</p>
    </li>
  );
}

export function KpiStrip() {
  const historical = useSimulationStore((state) => selectDisplayed(state).isHistorical);

  return (
    <section aria-labelledby="kpi-heading">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h2 id="kpi-heading" className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-2">
          핵심 모델 신호
        </h2>
        <p className="text-[0.68rem] text-ink-2">
          {historical ? '선택한 기록 샘플' : '현재 엔진 snapshot'} · 0–1 정규화
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 overflow-x-auto pb-1 md:flex" aria-label="현재 핵심 모델 신호">
        {KPI_DEFINITIONS.map((definition) => (
          <KpiCard key={definition.signal} definition={definition} />
        ))}
      </ul>
    </section>
  );
}
