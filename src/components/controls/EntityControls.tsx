'use client';

/**
 * 추상 역할별로 묶은 노드별 컨트롤.
 *
 * 여기 있는 모든 값은 가상 그래프의 노드를 위한 0–1 무차원 교육용 파라미터다. 이
 * 패널의 어떤 것도 실제로 존재하는 무언가를 설명하지 않는다.
 */
import { ENTITY_DEFINITIONS, ENTITY_KIND_LABELS } from '@/simulation/entities';
import { CollapsibleSection } from '@/components/dashboard/CollapsibleSection';
import type { EntityDefinition, EntityKind } from '@/simulation/types';
import { useSimulationStore } from '@/store/simulationStore';
import { NormalizedSlider } from './NormalizedSlider';

const KIND_GROUPS: ReadonlyArray<{ readonly kind: EntityKind; readonly legend: string }> = [
  { kind: 'precursor', legend: ENTITY_KIND_LABELS.precursor },
  { kind: 'activated', legend: ENTITY_KIND_LABELS.activated },
  { kind: 'cofactor', legend: ENTITY_KIND_LABELS.cofactor },
  { kind: 'complex', legend: ENTITY_KIND_LABELS.complex },
  { kind: 'inhibitor', legend: ENTITY_KIND_LABELS.inhibitor },
  { kind: 'structural', legend: ENTITY_KIND_LABELS.structural },
  { kind: 'surface', legend: ENTITY_KIND_LABELS.surface },
];

/**
 * 공급값 근처를 유지하는 대신 그래프가 만들어 내는 노드들. 이런 노드는 공급 컨트롤이
 * 아무 효과가 없으므로 안내 문구와 함께 비활성 상태로 그려진다.
 */
const PRODUCED_NOTE =
  '직접 설정하는 값이 아니라 반응망이 만들어 내는 값이므로, 이 공급 컨트롤은 동작하지 않는다.';
const SUPPLY_NOTE = '이 노드가 근처를 유지하는 정규화 공급 목표, 0에서 1 사이.';

function EntityRow({ definition }: { readonly definition: EntityDefinition }) {
  const { id, label, glyph, shortCode, color, behavior } = definition;

  const supply = useSimulationStore((state) => state.config.supply[id]);
  const enabled = useSimulationStore((state) => state.config.enabled[id]);
  const isSelected = useSimulationStore((state) => state.selectedEntityId === id);
  const setSupply = useSimulationStore((state) => state.setSupply);
  const setEntityEnabled = useSimulationStore((state) => state.setEntityEnabled);
  const selectEntity = useSimulationStore((state) => state.selectEntity);

  const isProduced = behavior !== 'reservoir';
  const toggleId = `entity-enabled-${id}`;
  const sliderId = `entity-supply-${id}`;

  return (
    <li
      className={
        isSelected
          ? 'rounded-md border border-accent-dim bg-surface-2 p-2.5'
          : 'rounded-md border border-line bg-surface-2 p-2.5'
      }
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <input
            id={toggleId}
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEntityEnabled(id, event.target.checked)}
            className="size-3.5 shrink-0 cursor-pointer accent-accent"
          />
          <label htmlFor={toggleId} className="cursor-pointer text-[0.7rem] text-ink-1">
            {label} 노드를 반응망에 포함
          </label>
        </span>
        <button
          type="button"
          aria-pressed={isSelected}
          aria-label={`${label} 살펴보기`}
          onClick={() => selectEntity(id)}
          className={
            isSelected
              ? 'shrink-0 rounded-sm border border-accent-dim bg-accent-dim/30 px-2 py-0.5 text-[0.7rem] font-semibold text-ink-0'
              : 'shrink-0 rounded-sm border border-line bg-surface-3 px-2 py-0.5 text-[0.7rem] font-semibold text-ink-1 hover:text-ink-0'
          }
        >
          살펴보기
        </button>
      </div>

      <NormalizedSlider
        id={sliderId}
        label={`${label} 공급값`}
        value={supply}
        onChange={(next) => setSupply(id, next)}
        description={isProduced ? PRODUCED_NOTE : SUPPLY_NOTE}
        disabled={isProduced}
        accentColor={color}
        glyph={glyph}
        shortCode={shortCode}
      />
    </li>
  );
}

export function EntityControls() {
  return (
    <CollapsibleSection title="분자 컨트롤" defaultOpen={false}>
      <div className="flex flex-col gap-5 px-4 pt-3">
        {KIND_GROUPS.map((group) => {
          const members = ENTITY_DEFINITIONS.filter(
            (definition) => definition.kind === group.kind,
          );
          if (members.length === 0) return null;

          return (
            <fieldset key={group.kind}>
              <legend className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-ink-2">
                {group.legend}
              </legend>
              <ul className="flex flex-col gap-2">
                {members.map((definition) => (
                  <EntityRow key={definition.id} definition={definition} />
                ))}
              </ul>
            </fieldset>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
