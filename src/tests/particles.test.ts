/**
 * 입자 예산.
 *
 * 슬라이더를 어떻게 두든, 장면은 `MAX_VISIBLE_PARTICLES`개를 넘는 인스턴스를
 * 절대 할당해서는 안 된다. 할당은 순수 함수이므로 WebGL 스모크 테스트에 기대는
 * 대신 시드 기반 생성기로 퍼징한다.
 */
import { describe, expect, it } from 'vitest';
import {
  ENTITY_DEFINITIONS,
  ENTITY_IDS,
  createDefaultFlags,
  createLevels,
} from '@/simulation/entities';
import {
  MAX_VISIBLE_PARTICLES,
  MIN_PARTICLES_PER_ENTITY,
  PARTICLE_CAPACITY,
  PARTICLE_ENTITIES,
  allocateParticles,
} from '@/simulation/particles';
import type { EntityFlags, EntityId, EntityLevels } from '@/simulation/types';

/** 어떤 장비에서도 퍼징이 재현되도록 쓰는 시드 기반 의사 난수 생성기(mulberry32). */
function createTestRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sumCounts(counts: Readonly<Record<EntityId, number>>): number {
  return ENTITY_IDS.reduce((total, id) => total + counts[id], 0);
}

describe('입자 용량 표', () => {
  it('합계가 전역 상한을 넘지 않는다', () => {
    const total = Object.values(PARTICLE_CAPACITY).reduce(
      (sum, capacity) => sum + capacity,
      0,
    );
    expect(total).toBeLessThanOrEqual(MAX_VISIBLE_PARTICLES);
  });

  it('모든 입자 엔티티에 양의 정수 용량을 준다', () => {
    for (const id of PARTICLE_ENTITIES) {
      const capacity = PARTICLE_CAPACITY[id];
      expect(Number.isInteger(capacity), `${id} 용량은 정수여야 한다`).toBe(
        true,
      );
      expect(capacity, `${id} 용량`).toBeGreaterThanOrEqual(
        MIN_PARTICLES_PER_ENTITY,
      );
    }
  });

  it('입자 렌더링으로 표시된 엔티티만 정확히 나열한다', () => {
    const expected = ENTITY_DEFINITIONS.filter(
      (definition) => definition.renderAsParticles,
    ).map((definition) => definition.id);
    expect([...PARTICLE_ENTITIES]).toEqual(expected);
    expect(PARTICLE_ENTITIES).not.toContain('fibrin');
    expect(PARTICLE_ENTITIES).not.toContain('platelets');
  });

  it('전용 렌더러가 있는 엔티티에는 용량 0을 준다', () => {
    expect(PARTICLE_CAPACITY.fibrin).toBe(0);
    expect(PARTICLE_CAPACITY.platelets).toBe(0);
  });
});

describe('allocateParticles', () => {
  it('반응망이 완전히 포화돼도 상한 안에 머문다', () => {
    const levels = createLevels(1);
    const allocation = allocateParticles(levels, 1);

    expect(allocation.total).toBeLessThanOrEqual(MAX_VISIBLE_PARTICLES);
    expect(allocation.total).toBe(sumCounts(allocation.counts));
    for (const id of PARTICLE_ENTITIES) {
      expect(allocation.counts[id], `${id}`).toBeLessThanOrEqual(
        PARTICLE_CAPACITY[id],
      );
    }
  });

  it('밀도가 0이면 아무것도 할당하지 않는다', () => {
    const allocation = allocateParticles(createLevels(1), 0);
    expect(allocation.total).toBe(0);
    for (const id of ENTITY_IDS) {
      expect(allocation.counts[id], `${id}`).toBe(0);
    }
  });

  it('존재하지 않는 엔티티에는 아무것도 할당하지 않는다', () => {
    const allocation = allocateParticles(createLevels(0), 1);
    expect(allocation.total).toBe(0);
  });

  it('비활성 엔티티에는 언제나 0을 할당한다', () => {
    const enabled: EntityFlags = { ...createDefaultFlags(true), factorXa: false };
    const allocation = allocateParticles(createLevels(1), 1, enabled);

    expect(allocation.counts.factorXa).toBe(0);
    expect(allocation.counts.factorIX).toBeGreaterThan(0);
    expect(allocation.total).toBeLessThanOrEqual(MAX_VISIBLE_PARTICLES);
  });

  it('더 낮은 maxParticles 인자를 명시하면 그 값을 따른다', () => {
    for (const ceiling of [0, 1, 5, 25, 50, 137, 399]) {
      const allocation = allocateParticles(createLevels(1), 1, undefined, ceiling);
      expect(
        allocation.total,
        `합계 ${allocation.total}이(가) 명시된 상한 ${ceiling}을 넘었다`,
      ).toBeLessThanOrEqual(ceiling);
      expect(allocation.total).toBe(sumCounts(allocation.counts));
    }
  });

  it('더 많이 요청받아도 전역 상한을 절대 넘지 않는다', () => {
    const allocation = allocateParticles(createLevels(1), 1, undefined, 10_000);
    expect(allocation.total).toBeLessThanOrEqual(MAX_VISIBLE_PARTICLES);
  });

  it('수준, 밀도, 활성 플래그에 대한 시드 기반 퍼징을 견딘다', () => {
    const random = createTestRandom(0x5c_e7_a1_09);
    const violations: string[] = [];
    const iterations = 3000;

    for (let run = 0; run < iterations && violations.length === 0; run += 1) {
      const levels: EntityLevels = createLevels(0);
      const enabled = createDefaultFlags(true);
      for (const id of ENTITY_IDS) {
        // 0과 1이 자주 나오도록 양 극단으로 치우치게 만든다.
        const roll = random();
        levels[id] = roll < 0.1 ? 0 : roll > 0.9 ? 1 : random();
        enabled[id] = random() > 0.2;
      }

      const densityRoll = random();
      const density = densityRoll < 0.1 ? 0 : densityRoll > 0.9 ? 1 : random();
      const useCeiling = random() > 0.5;
      const ceiling = useCeiling
        ? Math.floor(random() * (MAX_VISIBLE_PARTICLES + 50))
        : MAX_VISIBLE_PARTICLES;

      const allocation = allocateParticles(levels, density, enabled, ceiling);
      const effectiveCeiling = Math.min(ceiling, MAX_VISIBLE_PARTICLES);
      const context = `실행 ${run} 밀도=${density} 상한=${ceiling}`;

      if (allocation.total > effectiveCeiling) {
        violations.push(`${context}: 합계 ${allocation.total} > ${effectiveCeiling}`);
      }
      if (allocation.total > MAX_VISIBLE_PARTICLES) {
        violations.push(`${context}: 합계 ${allocation.total}이(가) 전역 상한을 넘었다`);
      }
      if (allocation.total !== sumCounts(allocation.counts)) {
        violations.push(
          `${context}: 합계 ${allocation.total} != 개수 총합 ${sumCounts(allocation.counts)}`,
        );
      }

      for (const id of ENTITY_IDS) {
        const count = allocation.counts[id];
        if (!Number.isInteger(count) || count < 0) {
          violations.push(`${context}: ${id} 개수 ${String(count)}이(가) 정수가 아니다`);
        }
        if (count > PARTICLE_CAPACITY[id]) {
          violations.push(
            `${context}: ${id} 개수 ${count}이(가) 용량 ${PARTICLE_CAPACITY[id]}을 넘었다`,
          );
        }
        if (!enabled[id] && count !== 0) {
          violations.push(`${context}: 비활성 ${id}에 ${count}개가 할당됐다`);
        }
        if (density === 0 && count !== 0) {
          violations.push(`${context}: 밀도가 0인데 ${id}에 ${count}개가 할당됐다`);
        }
      }
    }

    expect(
      violations,
      `입자 할당 위반:\n${violations.slice(0, 10).join('\n')}`,
    ).toEqual([]);
  });

  it('수준을 고정하면 밀도에 따라 단조롭게 커진다', () => {
    const levels = createLevels(0.8);
    let previous = -1;
    for (const density of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const { total } = allocateParticles(levels, density);
      expect(total, `밀도 ${density}`).toBeGreaterThanOrEqual(previous);
      previous = total;
    }
    expect(previous).toBeGreaterThan(0);
  });
});
