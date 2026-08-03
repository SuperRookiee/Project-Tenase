'use client';

/**
 * 노드 인스펙터.
 *
 * 선택된 노드의 추상 정의, 지금 참여하고 있는 짝, 그리고 그 노드를 언급하는 최근
 * 추상 반응 이벤트를 보여 준다. 모든 값은 0에서 1 사이 척도의 무차원 값이다.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { ENTITY_KIND_LABELS, getEntity } from '@/simulation/entities';
import { formatNormalized, formatPercentOfScale } from '@/simulation/numeric';
import {
  REACTION_DEFINITIONS,
  REACTION_KIND_LABELS,
  reactionParticipants,
  reactionsInvolving,
} from '@/simulation/reactions';
import { getReactionTrace } from '@/simulation/reactionTrace';
import type { ActiveBinding, EntityId, ReactionEvent } from '@/simulation/types';
import {
  selectDisplayed,
  useSimulationStore,
} from '@/store/simulationStore';

/** 최근 이벤트를 몇 개까지 나열할지. 엔진은 작은 고정 구간만 유지한다. */
const MAX_LISTED_EVENTS = 12;

type EventFilter = 'all' | 'activation' | 'inhibition' | 'complex';

function kindLabel(kind: string): string {
  return REACTION_KIND_LABELS[kind as keyof typeof REACTION_KIND_LABELS] ?? kind;
}

function entityLabels(ids: readonly EntityId[]): string {
  if (ids.length === 0) return '없음';
  return ids
    .map((id) => {
      const definition = getEntity(id);
      return `${definition.glyph} ${definition.shortCode}`;
    })
    .join(', ');
}

interface FieldProps {
  readonly label: string;
  readonly children: ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div className="border-t border-line py-2 first:border-t-0">
      <dt className="text-[0.65rem] uppercase tracking-wide text-ink-2">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink-0">{children}</dd>
    </div>
  );
}

function BindingList({ bindings }: { readonly bindings: readonly ActiveBinding[] }) {
  if (bindings.length === 0) {
    return (
      <p className="text-sm text-ink-2">
        지금 이 노드가 참여한 엣지 중 측정 가능한 활동을 나르는 것이 없다.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {bindings.map((binding) => (
        <li
          key={binding.reactionId}
          className="rounded border border-line bg-surface-2 p-2"
        >
          <p className="text-sm text-ink-0">{binding.reactionLabel}</p>
          <p className="mt-0.5 text-xs text-ink-2">
            {kindLabel(binding.kind)} · 참여 노드: {entityLabels(binding.partnerEntityIds)}
          </p>
          <p className="mt-0.5 font-mono text-xs text-ink-1">
            세기 {formatNormalized(binding.strength)} (
            {formatPercentOfScale(binding.strength)})
          </p>
        </li>
      ))}
    </ul>
  );
}

export function InspectorPanel() {
  const selectedEntityId = useSimulationStore((state) => state.selectedEntityId);
  const tick = useSimulationStore((state) => state.frame.tick);
  const events = useSimulationStore((state) => state.frame.events);
  const config = useSimulationStore((state) => state.config);
  // `selectDisplayed`는 실시간 또는 스크러브된 레코드를 참조로 돌려주므로, 이
  // 선택은 발행된 프레임 사이에서 참조가 안정적이다.
  const levels = useSimulationStore((state) => selectDisplayed(state).levels);
  const reactionActivity = useSimulationStore(
    (state) => selectDisplayed(state).reactionActivity,
  );
  const displayedTick = useSimulationStore((state) => selectDisplayed(state).tick);
  const reducedMotion = useSimulationStore((state) => state.reducedMotion);
  const cameraStoryTarget = useSimulationStore((state) => state.cameraStoryTarget);
  const startCameraStory = useSimulationStore((state) => state.startCameraStory);
  const stopCameraStory = useSimulationStore((state) => state.stopCameraStory);

  const [filter, setFilter] = useState<EventFilter>('all');

  const bindings = useMemo<readonly ActiveBinding[]>(() => {
    void tick;
    if (selectedEntityId === null) return [];
    return REACTION_DEFINITIONS.flatMap((reaction) => {
      const participants = reactionParticipants(reaction);
      if (!participants.includes(selectedEntityId)) return [];
      const strength = reactionActivity[reaction.id] ?? 0;
      if (strength <= 0.0001) return [];
      return [{
        reactionId: reaction.id,
        reactionLabel: reaction.label,
        kind: reaction.kind,
        partnerEntityIds: participants.filter((id) => id !== selectedEntityId),
        strength,
      } satisfies ActiveBinding];
    }).sort((left, right) => right.strength - left.strength);
  }, [reactionActivity, selectedEntityId, tick]);

  const listedEvents = useMemo<readonly ReactionEvent[]>(() => {
    const ordered = events
      .filter((event) => event.tick <= displayedTick)
      .reverse();
    const filtered = ordered.filter((event) => {
      if (filter === 'all') return true;
      if (filter === 'complex') return event.kind === 'binding';
      return event.kind === filter;
    });
    return filtered.slice(0, MAX_LISTED_EVENTS);
  }, [displayedTick, events, filter]);

  const definition = selectedEntityId === null ? null : getEntity(selectedEntityId);
  const level = selectedEntityId === null ? 0 : levels[selectedEntityId];
  const supply = selectedEntityId === null ? 0 : config.supply[selectedEntityId];
  const enabled = selectedEntityId === null ? false : config.enabled[selectedEntityId];
  const inhibitoryRelationships = useMemo(() => {
    if (selectedEntityId === null) return [];
    return reactionsInvolving(selectedEntityId).filter(
      (reaction) =>
        reaction.kind === 'inhibition' ||
        reaction.modulators.some(
          (modulator) =>
            modulator.entityId === selectedEntityId && modulator.mode === 'inhibitor',
        ),
    );
  }, [selectedEntityId]);
  const traceReactions = useMemo(() => {
    if (selectedEntityId === null) return [];
    const trace = getReactionTrace(selectedEntityId);
    return REACTION_DEFINITIONS.filter((reaction) =>
      trace.reactionIds.has(reaction.id),
    );
  }, [selectedEntityId]);

  const status = !enabled
    ? '네트워크에서 꺼짐'
    : level >= 0.05
      ? '활동 신호 있음'
      : '현재 활동 낮음';

  return (
    <section
      aria-labelledby="inspector-heading"
      className="flex flex-col gap-4 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="inspector-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-1">
          분자 인스펙터
        </h2>
        <span className="rounded border border-accent-dim bg-accent-dim/20 px-2 py-0.5 text-[0.65rem] font-semibold text-accent">
          선택 상태
        </span>
      </div>

      {definition === null || selectedEntityId === null ? (
        <p className="rounded border border-dashed border-line bg-surface-1 p-4 text-sm text-ink-2">
          선택된 분자가 없다. 컨트롤 패널의 “살펴보기”를 선택하면 모델 안의 역할,
          현재 정규화 활동도와 상호작용을 확인할 수 있다.
        </p>
      ) : (
        <>
          <header className="rounded-lg border border-accent-dim bg-surface-1 p-3" aria-live="polite">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 shrink-0 rounded-sm border border-line-strong"
                style={{ backgroundColor: definition.color }}
              />
              <span className="font-mono text-base" aria-hidden="true">
                {definition.glyph}
              </span>
              <h3 className="text-base font-semibold text-ink-0">
                {definition.label}
              </h3>
              <span className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink-1">
                {definition.shortCode}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-2">
              {ENTITY_KIND_LABELS[definition.kind]} · {status} · 현재 선택됨
            </p>
          </header>

          <dl className="rounded-lg border border-line bg-surface-1 px-3 py-1">
            <Field label="분자 유형">{ENTITY_KIND_LABELS[definition.kind]}</Field>
            <Field label="모델 안의 역할">
              <details>
                <summary className="cursor-pointer text-sm text-ink-0">역할 설명 보기</summary>
                <p className="mt-1 text-sm leading-relaxed text-ink-1">{definition.role}</p>
              </details>
            </Field>
            <Field label="현재 활동">
              <span className="font-mono">{formatNormalized(level, 2)}</span>{' '}
              <span className="text-ink-2">({formatPercentOfScale(level)})</span>
            </Field>
            <Field label="설정된 입력">
              <span className="font-mono">{formatNormalized(supply, 2)}</span>{' '}
              <span className="text-ink-2">({formatPercentOfScale(supply)})</span>
            </Field>
            <Field label="참여 상태">
              {enabled ? '켜짐' : '꺼짐'}
            </Field>
            <Field label="현재 상태">{status}</Field>
          </dl>

          <div className="rounded-lg border border-accent-dim bg-accent-dim/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">
                  상류 반응 경로
                </h3>
                <p className="mt-0.5 text-xs text-ink-2">
                  장면에서 이 분자까지 이어지는 경로만 밝게 유지한다.
                </p>
              </div>
              <button
                type="button"
                disabled={reducedMotion}
                aria-pressed={cameraStoryTarget === selectedEntityId}
                onClick={() =>
                  cameraStoryTarget === selectedEntityId
                    ? stopCameraStory()
                    : startCameraStory(selectedEntityId)
                }
                className="rounded border border-accent-dim bg-accent-dim/25 px-2 py-1 text-xs font-semibold text-ink-0 hover:bg-accent-dim/45 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cameraStoryTarget === selectedEntityId ? '재생 종료' : '선택 경로 재생'}
              </button>
            </div>
            {traceReactions.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">이 분자는 상류 생산 경로가 없는 시작 노드다.</p>
            ) : (
              <ol className="mt-3 flex flex-col gap-1 font-mono text-xs text-ink-1">
                {traceReactions.map((reaction, index) => (
                  <li key={reaction.id}>
                    <span className="text-accent">{reaction.label}</span>
                    {index < traceReactions.length - 1 ? (
                      <span aria-hidden="true" className="ml-2 text-ink-2">↓</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="rounded-lg border border-line bg-surface-1 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-1">
              활성 상호작용
            </h3>
            <p className="mb-2 mt-0.5 text-xs text-ink-2">
              현재 스텝에서 활동을 나르고 있는, 이 노드가 참여한 엣지들. 세기가 큰
              순서로 나열한다.
            </p>
            <BindingList bindings={bindings} />
          </div>

          <div className="rounded-lg border border-line bg-surface-1 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-1">
              억제 관계
            </h3>
            {inhibitoryRelationships.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">이 분자와 직접 연결된 억제 관계가 없다.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {inhibitoryRelationships.map((reaction) => (
                  <li key={reaction.id} className="rounded border border-inhibition/50 bg-inhibition/5 p-2">
                    <p className="text-sm text-ink-0">{reaction.label}</p>
                    <p className="mt-0.5 text-xs text-ink-2">{reaction.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-line bg-surface-1 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-1">
                최근 이벤트
              </h3>
              <fieldset className="flex flex-wrap items-center gap-2">
                <legend className="sr-only">반응 이벤트 필터</legend>
                {([
                  ['all', '전체'],
                  ['activation', '활성화'],
                  ['inhibition', '억제'],
                  ['complex', '복합체 형성'],
                ] as const).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-1 text-xs text-ink-1">
                    <input
                      type="radio"
                      name="event-filter"
                      value={value}
                      checked={filter === value}
                      onChange={() => setFilter(value)}
                      className="accent-accent"
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            </div>

            {listedEvents.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">
                이 필터로 기록된 반응 이벤트가 아직 없다.
              </p>
            ) : (
              <ol className="mt-2 flex flex-col gap-2" aria-live="polite" aria-label="실시간 반응 이벤트 스트림">
                {listedEvents.map((event, index) => (
                  <li
                    key={event.id}
                    style={{ opacity: Math.max(0.38, 1 - index * 0.065) }}
                    className={`reaction-event-enter rounded border bg-surface-2 p-2 ${index === 0 ? 'border-accent-dim' : 'border-line'}`}
                  >
                    <p className="text-sm text-ink-0">{event.reactionLabel}</p>
                    <p className="mt-0.5 text-xs text-ink-2">
                      {kindLabel(event.kind)} · 틱 {event.tick}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-ink-1">
                      크기 {formatNormalized(event.magnitude)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </section>
  );
}
