import { ENTITY_DEFINITIONS } from '@/simulation/entities';
import { getReaction, reactionParticipants } from '@/simulation/reactions';
import type { EntityId, ReactionEvent, SimulationSnapshot } from '@/simulation/types';

export type AnalysisEventKind =
  | 'activation'
  | 'binding'
  | 'complex-formation'
  | 'reaction'
  | 'inhibition'
  | 'dissociation'
  | 'decay';

export interface AnalysisEvent {
  readonly id: string;
  readonly kind: AnalysisEventKind;
  readonly label: string;
  readonly time: number;
  readonly tick: number;
  readonly participants: readonly EntityId[];
  readonly sampleIndex: number | null;
  readonly magnitude: number;
  readonly source: 'engine' | 'snapshot';
}

export const ANALYSIS_EVENT_LABELS: Readonly<Record<AnalysisEventKind, string>> = {
  activation: '활성화',
  binding: '결합',
  'complex-formation': '복합체 형성',
  reaction: '반응',
  inhibition: '억제',
  dissociation: '해리',
  decay: '감쇠',
};

/** 이벤트를 어디서 읽어 왔는지 나타내는 표시명. */
export const ANALYSIS_SOURCE_LABELS: Readonly<
  Record<AnalysisEvent['source'], string>
> = {
  engine: '엔진 이벤트',
  snapshot: '기록 snapshot',
};

function nearestSampleIndex(
  tick: number,
  snapshots: readonly SimulationSnapshot[],
): number | null {
  if (snapshots.length === 0) return null;
  let nearest = 0;
  let distance = Math.abs((snapshots[0]?.tick ?? tick) - tick);
  for (let index = 1; index < snapshots.length; index += 1) {
    const nextDistance = Math.abs((snapshots[index]?.tick ?? tick) - tick);
    if (nextDistance < distance) {
      nearest = index;
      distance = nextDistance;
    }
  }
  return nearest;
}

function fromEngineEvent(
  event: ReactionEvent,
  snapshots: readonly SimulationSnapshot[],
): readonly AnalysisEvent[] {
  const reaction = getReaction(event.reactionId);
  const kind: AnalysisEventKind =
    event.kind === 'conversion' ? 'reaction' : event.kind;
  const primary: AnalysisEvent = {
    id: event.id,
    kind,
    label: event.reactionLabel,
    time: event.time,
    tick: event.tick,
    participants: reactionParticipants(reaction),
    sampleIndex: nearestSampleIndex(event.tick, snapshots),
    magnitude: event.magnitude,
    source: 'engine',
  };
  if (event.kind !== 'binding') return [primary];
  return [
    primary,
    {
      ...primary,
      id: `${event.id}-complex`,
      kind: 'complex-formation',
      label: `${event.reactionLabel} 안정화`,
    },
  ];
}

/**
 * 기존 엔진 이벤트는 그대로 보존하고, 스냅샷 사이의 실제 수준 하락만 감쇠/해리
 * 이벤트로 해석한다. 시뮬레이션 수치나 진행 순서에는 영향을 주지 않는다.
 */
export function buildAnalysisEvents(
  events: readonly ReactionEvent[],
  snapshots: readonly SimulationSnapshot[],
): readonly AnalysisEvent[] {
  const result = events.flatMap((event) => fromEngineEvent(event, snapshots));

  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1];
    const current = snapshots[index];
    if (!previous || !current) continue;
    for (const entity of ENTITY_DEFINITIONS) {
      if (entity.behavior === 'reservoir') continue;
      const drop = previous.levels[entity.id] - current.levels[entity.id];
      if (drop < 0.015) continue;
      const dissociation = entity.id === 'tenaseComplex';
      result.push({
        id: `snapshot-${current.tick}-${entity.id}`,
        kind: dissociation ? 'dissociation' : 'decay',
        label: dissociation
          ? `${entity.label} 해리`
          : `${entity.label} 수준 감소`,
        time: current.time,
        tick: current.tick,
        participants: [entity.id],
        sampleIndex: index,
        magnitude: Math.min(1, drop),
        source: 'snapshot',
      });
    }
  }

  return result.sort((left, right) => right.tick - left.tick || left.id.localeCompare(right.id));
}

