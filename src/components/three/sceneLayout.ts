/**
 * 추상 장면을 배치하는 정적 기하 값.
 *
 * 범위 고지
 * ------------
 * 이 파일의 모든 좌표는 추상 그래프가 화면에서 또렷하게 읽히도록 고른, 지어낸 배치
 * 값이다. 여기 있는 어떤 것도 실제 해부 구조나 실제 분자 구조를 묘사하지 않는다.
 * 관, 구역, 표시 영역은 가상의 반응망에서 노드와 엣지를 대신하는 개념적 대체물이다.
 *
 * 모든 위치는 임의의 장면 단위다. 이 프로젝트 어디에도 물리 단위는 없으며, 이 숫자들
 * 가운데 어느 것도 시각화 밖에서는 아무 의미를 갖지 않는다.
 */
import type { EntityId } from '@/simulation/types';

/** 장면이 놓이는 양식화된 양끝 열린 관의 반지름. */
export const VESSEL_RADIUS = 2.6;

/** 양식화된 관의 길이. X축을 따라 잰 값이다. */
export const VESSEL_LENGTH = 15;

/**
 * 관 아래쪽 벽에 놓인, 단순화된 표시 영역의 중심.
 *
 * 추상적인 손상 신호가 이 패치의 발광 맥동, 그 둘레에 달라붙는 디스크 표면, 그리고
 * 구조 메시가 시작되는 지점을 구동한다.
 */
export const DAMAGE_CENTER: readonly [number, number, number] = [
  -5.4,
  -VESSEL_RADIUS,
  0,
];

/** 좌→우 흐름의 마지막 구역에서 구조 가닥이 자라나는 시각적 중심. */
export const FIBRIN_CENTER: readonly [number, number, number] = [
  5.15,
  -VESSEL_RADIUS,
  0,
];

/** 노드의 입자가 그 안에서 떠다니는 부드러운 구형 영역. */
export interface EntityZone {
  readonly center: readonly [number, number, number];
  readonly radius: number;
}

/**
 * 그래프의 각 노드가 관 안에서 자리하는 곳.
 *
 * 연쇄는 +X를 따라 왼쪽에서 오른쪽으로 읽히므로, 색에 기대지 않고도 흐름의 방향을
 * 알아볼 수 있다. 상류의 전구 노드는 X가 음수인 쪽에, 중심 출력 노드와 구조 스테이지는
 * X가 양수인 쪽에 놓이고, 두 억제성 노드는 자신이 감쇠시키는 노드 옆의 축에서 벗어난
 * 자리에 놓인다.
 */
export const ENTITY_ZONES: Readonly<Record<EntityId, EntityZone>> = {
  factorIX: { center: [-6.0, 0.9, 0.5], radius: 0.9 },
  factorIXa: { center: [-4.7, 0.2, -0.7], radius: 0.82 },
  factorVIIIa: { center: [-4.1, -1.0, 0.7], radius: 0.82 },
  tenaseComplex: { center: [-2.8, -0.55, -0.2], radius: 0.78 },
  factorX: { center: [-1.4, 1.0, 0.4], radius: 1.0 },
  factorXa: { center: [0.2, 0.1, -0.8], radius: 0.95 },
  prothrombin: { center: [1.7, 1.0, 0.5], radius: 0.9 },
  thrombin: { center: [3.1, 0.0, -0.4], radius: 0.82 },
  fibrinogen: { center: [4.5, 0.9, 0.6], radius: 0.88 },
  fibrin: { center: [5.2, -1.25, 0.0], radius: 0.9 },
  tfpi: { center: [-0.6, 1.35, -0.7], radius: 0.8 },
  antithrombin: { center: [4.0, -1.2, -0.8], radius: 0.8 },
  platelets: { center: [-5.25, -1.35, 0.0], radius: 0.9 },
};

/**
 * 각 엣지의 일시적 맥동이 배치되는 자리. 반응 id를 키로 삼는다.
 *
 * 자리는 엣지가 잇는 두 노드의 구역 사이에 놓여, 맥동이 그 엣지에 속한 것으로 읽히게
 * 한다. 엣지 종류를 구분하는 것은 색이 아니라 기하 형태다 — `ReactionPulses`를 볼 것.
 */
export const REACTION_SITES: Readonly<
  Record<string, readonly [number, number, number]>
> = {
  'r1-activation': [-5.35, 0.5, -0.1],
  'r2-binding': [-3.55, -0.5, 0.2],
  'r3-conversion': [-1.1, 0.2, -0.3],
  'r4-conversion': [1.5, 0.3, 0.2],
  'r5-conversion': [4.45, -0.2, 0.1],
  'i1-inhibition': [-0.2, 1.0, -0.8],
  'i2-inhibition': [3.6, -1.0, -0.6],
};

/**
 * 작은 결정론적 유사 난수 생성기(mulberry32).
 *
 * 장면은 흩뿌린 위치, 위상 오프셋, 지터 값을 만들 때 플랫폼 내장 난수 소스가 아니라
 * 언제나 이것을 쓴다. 그래서 같은 시드는 항상 정확히 같은 배열을 만들어 낸다.
 * 시뮬레이션 상태는 결코 여기서 파생되지 않는다. 이 생성기는 추상 배치가 화면에 어떻게
 * 흩뿌려지는지에만 영향을 준다.
 */
export function createSeededRandom(seed: number): () => number {
  const normalizedSeed = Number.isFinite(seed) ? Math.trunc(seed) : 1;
  let state = (Math.imul(normalizedSeed ^ 0x9e3779b9, 0x85ebca6b) >>> 0) || 0x6d2b79f5;

  return function nextValue(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
