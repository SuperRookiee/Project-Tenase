/**
 * 선택한 엔티티까지 이어지는 생산 경로를 계산하는 순수 시각화 유틸리티.
 * 엔진 유량이나 수준을 계산하지 않으며 기존 반응 정의를 읽기만 한다.
 */
import { ENTITY_IDS } from './entities';
import { REACTION_DEFINITIONS, reactionParticipants } from './reactions';
import type { EntityId } from './types';

export interface ReactionTrace {
  readonly entityIds: ReadonlySet<EntityId>;
  readonly reactionIds: ReadonlySet<string>;
}

function buildTrace(target: EntityId): ReactionTrace {
  const entityIds = new Set<EntityId>();
  const reactionIds = new Set<string>();

  function visit(entityId: EntityId): void {
    if (entityIds.has(entityId)) return;
    entityIds.add(entityId);

    for (const reaction of REACTION_DEFINITIONS) {
      if (reaction.kind === 'inhibition') continue;
      if (!reaction.products.some((product) => product.entityId === entityId)) continue;

      reactionIds.add(reaction.id);
      for (const reactant of reaction.reactants) visit(reactant.entityId);
      for (const modulator of reaction.modulators) {
        if (modulator.mode === 'catalyst') visit(modulator.entityId);
      }
    }
  }

  visit(target);
  return { entityIds, reactionIds };
}

const TRACES = new Map<EntityId, ReactionTrace>(
  ENTITY_IDS.map((id) => [id, buildTrace(id)]),
);

const NEIGHBORS = new Map<EntityId, ReadonlySet<EntityId>>(
  ENTITY_IDS.map((id) => {
    const neighbors = new Set<EntityId>([id]);
    for (const reaction of REACTION_DEFINITIONS) {
      const participants = reactionParticipants(reaction);
      if (!participants.includes(id)) continue;
      participants.forEach((participant) => neighbors.add(participant));
    }
    return [id, neighbors];
  }),
);

export function getReactionTrace(id: EntityId): ReactionTrace {
  const trace = TRACES.get(id);
  if (!trace) throw new RangeError(`알 수 없는 엔티티 id: ${String(id)}`);
  return trace;
}

export function getInteractionNeighbors(id: EntityId): ReadonlySet<EntityId> {
  const neighbors = NEIGHBORS.get(id);
  if (!neighbors) throw new RangeError(`알 수 없는 엔티티 id: ${String(id)}`);
  return neighbors;
}
