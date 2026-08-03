/**
 * 입자 예산 배분.
 *
 * 슬라이더를 어떻게 놓든 장면의 인스턴스 총합이 `MAX_VISIBLE_PARTICLES`를 넘는
 * 일은 없다. 배분은 순수 함수이므로 WebGL 컨텍스트 없이도 검증할 수 있다.
 */
import { ENTITY_DEFINITIONS } from './entities';
import { clamp01 } from './numeric';
import type { EntityId, EntityLevels } from './types';

/** 동시에 보이는 입자 인스턴스 수의 절대 상한. */
export const MAX_VISIBLE_PARTICLES = 400;

/** 조금이라도 존재하는 노드에 대해 표시하는 최소 입자 수. */
export const MIN_PARTICLES_PER_ENTITY = 2;

/** 자유롭게 떠다니는 입자로 그리는 노드들. 렌더 순서는 고정이다. */
export const PARTICLE_ENTITIES: readonly EntityId[] = ENTITY_DEFINITIONS.filter(
  (definition) => definition.renderAsParticles,
).map((definition) => definition.id);

/**
 * 노드별 인스턴스 용량. 모든 용량의 합이 전역 상한 안에 정확히 들어오도록 크기를
 * 정한다. 인스턴스 메시는 이 크기로 한 번만 할당하고, 실행 중에는 그리는 개수만
 * 바꾼다.
 */
export const PARTICLE_CAPACITY: Readonly<Record<EntityId, number>> = (() => {
  const weights = PARTICLE_ENTITIES.map((id) => {
    const definition = ENTITY_DEFINITIONS.find((entity) => entity.id === id);
    return definition ? definition.particleWeight : 0;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  const capacity = {} as Record<EntityId, number>;
  for (const definition of ENTITY_DEFINITIONS) {
    capacity[definition.id] = 0;
  }

  let allocated = 0;
  PARTICLE_ENTITIES.forEach((id, index) => {
    const weight = weights[index] ?? 0;
    const share = Math.floor((weight / totalWeight) * MAX_VISIBLE_PARTICLES);
    capacity[id] = share;
    allocated += share;
  });

  // 반올림하고 남은 나머지는 상한을 지키는 선에서 첫 번째 노드에 몰아준다.
  const remainder = MAX_VISIBLE_PARTICLES - allocated;
  const first = PARTICLE_ENTITIES[0];
  if (remainder > 0 && first !== undefined) {
    capacity[first] += remainder;
  }

  return capacity;
})();

export interface ParticleAllocation {
  readonly counts: Readonly<Record<EntityId, number>>;
  readonly total: number;
}

/**
 * 각 노드를 몇 개의 인스턴스로 그릴지 결정한다.
 *
 * 개수는 해당 노드의 정규화된 수준과 전역 밀도 설정에 비례하고, 노드마다 상한이
 * 걸리며, 합계가 전역 상한을 넘게 될 경우 비례해서 줄어든다. 결과는
 * `total <= MAX_VISIBLE_PARTICLES`를 반드시 만족한다.
 */
export function allocateParticles(
  levels: EntityLevels,
  particleDensity: number,
  enabled?: Readonly<Record<EntityId, boolean>>,
  maxParticles: number = MAX_VISIBLE_PARTICLES,
): ParticleAllocation {
  const density = clamp01(particleDensity);
  const ceiling = Math.max(0, Math.min(maxParticles, MAX_VISIBLE_PARTICLES));

  const counts = {} as Record<EntityId, number>;
  for (const definition of ENTITY_DEFINITIONS) {
    counts[definition.id] = 0;
  }

  let total = 0;
  for (const id of PARTICLE_ENTITIES) {
    if (enabled && enabled[id] === false) continue;

    const level = clamp01(levels[id] ?? 0);
    const capacity = PARTICLE_CAPACITY[id] ?? 0;
    if (level <= 0 || capacity <= 0 || density <= 0) continue;

    const scaled = Math.round(capacity * level * density);
    const count = Math.min(capacity, Math.max(MIN_PARTICLES_PER_ENTITY, scaled));
    counts[id] = count;
    total += count;
  }

  if (total > ceiling) {
    const factor = ceiling / total;
    total = 0;
    for (const id of PARTICLE_ENTITIES) {
      const scaled = Math.floor((counts[id] ?? 0) * factor);
      counts[id] = scaled;
      total += scaled;
    }
    // 내림 기반 축소는 모자랄 수는 있어도 상한을 넘길 수는 없다.
    while (total > ceiling) {
      for (const id of PARTICLE_ENTITIES) {
        if (total <= ceiling) break;
        if ((counts[id] ?? 0) > 0) {
          counts[id] -= 1;
          total -= 1;
        }
      }
    }
  }

  return { counts, total };
}
