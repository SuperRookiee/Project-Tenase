/**
 * Mol* 월드 좌표계에 놓는 캐스케이드 배치.
 *
 * 범위 고지
 * ---------
 * 여기 있는 좌표는 추상 그래프가 화면에서 또렷하게 읽히도록 고른 지어낸 배치 값이다.
 * 해부 구조도 분자 구조도 묘사하지 않는다.
 *
 * 노드 위치는 legacy R3F 장면이 쓰는 `ENTITY_ZONES`를 그대로 가져와 관 크기 차이만큼
 * 배율만 맞춘 것이다. 좌표를 다시 적지 않으므로 두 렌더러가 같은 배치를 공유한다.
 * 흐름 엣지는 `GRAPH_EDGES`에서 파생하므로 반응 그래프를 고치면 함께 따라온다.
 *
 * 축 방향과 반경 방향에 다른 배율을 쓰는 이유: legacy 관은 반지름 2.6 · 길이 15로
 * 가늘고 길지만 Mol* 관은 반지름 34 · 길이 116으로 뭉툭하다. 등방 배율로 옮기면
 * 노드가 축 근처에 몰려 원래 설계의 화면상 비율이 무너진다. 개념적 배치이므로
 * 등방일 필요가 없다.
 */
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { ENTITY_ZONES } from '@/components/three/sceneLayout';
import { ENTITY_IDS } from '@/simulation/entities';
import { GRAPH_EDGES, getReaction } from '@/simulation/reactions';
import type { EntityId, ReactionKind } from '@/simulation/types';

/** legacy 장면 단위를 Mol* 관의 축 방향으로 옮기는 배율. */
const AXIAL_SCALE = 7.6;
/** 같은 값을 반경 방향으로 옮기는 배율. 관이 뭉툭한 만큼 더 크다. */
const RADIAL_SCALE = 12;
/**
 * 노드 구역 반지름을 구체 기본 반지름으로 옮기는 배율.
 *
 * 수준 1에서 가장 가까운 두 노드가 겨우 닿지 않을 만큼이 상한이다. 관 반지름이 34나
 * 되므로 이보다 작으면 노드가 점으로 뭉개져 읽히지 않는다.
 */
const NODE_RADIUS_SCALE = 6;

export interface CascadeNode {
  readonly entityId: EntityId;
  readonly center: Vec3;
  /** 수준이 1일 때의 구체 반지름. 실제 반지름은 수준에 따라 줄어든다. */
  readonly baseRadius: number;
}

/** 캐스케이드 노드. `ENTITY_IDS` 순서를 유지하므로 group 색인이 안정적이다. */
export const CASCADE_NODES: readonly CascadeNode[] = ENTITY_IDS.map((id) => {
  const zone = ENTITY_ZONES[id];
  return {
    entityId: id,
    center: Vec3.create(
      zone.center[0] * AXIAL_SCALE,
      zone.center[1] * RADIAL_SCALE,
      zone.center[2] * RADIAL_SCALE,
    ),
    baseRadius: zone.radius * NODE_RADIUS_SCALE,
  };
});

const NODE_INDEX: ReadonlyMap<EntityId, number> = new Map(
  CASCADE_NODES.map((node, index) => [node.entityId, index] as const),
);

export function cascadeNodeIndex(id: EntityId): number {
  const index = NODE_INDEX.get(id);
  if (index === undefined) {
    throw new RangeError(`캐스케이드 배치에 없는 엔티티 id: ${String(id)}`);
  }
  return index;
}

export type FlowRelation = 'produces' | 'catalyzes' | 'inhibits';

export interface CascadeLink {
  readonly from: EntityId;
  readonly to: EntityId;
  readonly relation: FlowRelation;
  readonly kind: ReactionKind;
  /**
   * 이 엣지를 만들어 낸 반응들. 같은 두 노드를 같은 관계로 잇는 엣지가 둘 이상이면
   * (예를 들어 TFPI ⊣ Factor Xa는 전환 엣지의 조절자로도, 억제 엣지로도 나타난다)
   * 하나로 합치고 활동도는 그중 최댓값을 쓴다.
   */
  readonly reactionIds: readonly string[];
  readonly start: Vec3;
  readonly end: Vec3;
  readonly length: number;
}

/**
 * 그릴 수 있는 흐름 엣지.
 *
 * `GRAPH_EDGES`는 생성물이 없는 억제 반응에 대해 자기 자신을 잇는 퇴화 엣지를 함께
 * 내놓는다. 그 엣지는 기하로 그릴 수 없으므로 걸러 낸다.
 */
export const CASCADE_LINKS: readonly CascadeLink[] = (() => {
  const merged = new Map<string, { edge: (typeof GRAPH_EDGES)[number]; reactionIds: string[] }>();

  for (const edge of GRAPH_EDGES) {
    if (edge.from === edge.to || edge.relation === 'consumes') continue;
    const key = `${edge.from}|${edge.to}|${edge.relation}`;
    const existing = merged.get(key);
    if (existing) {
      existing.reactionIds.push(edge.reactionId);
      continue;
    }
    merged.set(key, { edge, reactionIds: [edge.reactionId] });
  }

  return [...merged.values()].map(({ edge, reactionIds }) => {
    const start = CASCADE_NODES[cascadeNodeIndex(edge.from)].center;
    const end = CASCADE_NODES[cascadeNodeIndex(edge.to)].center;
    return {
      from: edge.from,
      to: edge.to,
      relation: edge.relation as FlowRelation,
      kind: getReaction(edge.reactionId).kind,
      reactionIds,
      start,
      end,
      length: Vec3.distance(start, end),
    };
  });
})();
