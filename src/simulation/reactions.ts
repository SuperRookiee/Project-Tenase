/**
 * 추상 반응 그래프.
 *
 * 설정 가능한 데이터 주도 방향 그래프다. 엣지는 이 프로젝트가 요구한 단순화된
 * 교육용 관계만을 담으며, 그 이상은 아무것도 담지 않는다.
 *
 *   Factor IX                      -> Factor IXa
 *   Factor IXa + Factor VIIIa      -> Tenase Complex
 *   Tenase Complex + Factor X      -> Factor Xa
 *   Factor Xa + Prothrombin        -> Thrombin
 *   Thrombin + Fibrinogen          -> Fibrin
 *   TFPI                          -| Factor Xa 경로
 *   Antithrombin                  -| 활성 Thrombin
 *
 * `rate` 값들은 화면에서 애니메이션이 또렷하게 읽히도록 임의로 고른 무차원 조정
 * 상수다. 반응 속도 상수가 아니며 생화학적 의미를 담지 않는다.
 */
import type { EntityId, ReactionDefinition, ReactionKind } from './types';

/** 엣지 종류의 한국어 표시명. 인스펙터와 접근성 텍스트가 함께 사용한다. */
export const REACTION_KIND_LABELS: Readonly<Record<ReactionKind, string>> = {
  activation: '활성화 엣지',
  binding: '결합 엣지',
  conversion: '전환 엣지',
  inhibition: '억제 엣지',
};

export const REACTION_DEFINITIONS: readonly ReactionDefinition[] = [
  {
    id: 'r1-activation',
    label: 'Factor IX → Factor IXa',
    kind: 'activation',
    rate: 0.55,
    reactants: [{ entityId: 'factorIX', weight: 1, consumed: true }],
    products: [{ entityId: 'factorIXa', weight: 1 }],
    modulators: [
      { entityId: 'platelets', mode: 'catalyst', weight: 1, floor: 0.25 },
    ],
    requiresDamageSignal: true,
    description:
      '개시 엣지. 추상 손상 신호가 0보다 클 때만 열리며, 상류 전구 노드를 활성형으로 전환한다.',
  },
  {
    id: 'r2-binding',
    label: 'Factor IXa + Factor VIIIa → Tenase Complex',
    kind: 'binding',
    rate: 0.7,
    reactants: [
      { entityId: 'factorIXa', weight: 1, consumed: true },
      { entityId: 'factorVIIIa', weight: 1, consumed: true },
    ],
    products: [{ entityId: 'tenaseComplex', weight: 1 }],
    modulators: [
      { entityId: 'platelets', mode: 'catalyst', weight: 1, floor: 0.15 },
    ],
    requiresDamageSignal: false,
    description:
      '결합 엣지. 활성화된 상류 노드와 보조인자가 함께 소모되면서 추상 표면 노드 위에 복합체를 조립한다.',
  },
  {
    id: 'r3-conversion',
    label: 'Tenase Complex + Factor X → Factor Xa',
    kind: 'conversion',
    rate: 0.8,
    reactants: [{ entityId: 'factorX', weight: 1, consumed: true }],
    products: [{ entityId: 'factorXa', weight: 1 }],
    modulators: [
      // 복합체는 촉매 허브로 작용한다. 반드시 있어야 하지만 소모되지는 않는다.
      { entityId: 'tenaseComplex', mode: 'catalyst', weight: 1, floor: 0 },
      // "TFPI가 Factor Xa 경로를 줄인다" — 생성 엣지를 약화시킨다.
      { entityId: 'tfpi', mode: 'inhibitor', weight: 0.85, floor: 0 },
    ],
    requiresDamageSignal: false,
    description:
      '복합체가 구동하는 전환 엣지. 첫 번째 억제 노드가 이 엣지를 직접 약화시킨다.',
  },
  {
    id: 'r4-conversion',
    label: 'Factor Xa + Prothrombin → Thrombin',
    kind: 'conversion',
    rate: 0.75,
    reactants: [{ entityId: 'prothrombin', weight: 1, consumed: true }],
    products: [{ entityId: 'thrombin', weight: 1 }],
    modulators: [
      { entityId: 'factorXa', mode: 'catalyst', weight: 1, floor: 0 },
      { entityId: 'platelets', mode: 'catalyst', weight: 1, floor: 0.3 },
    ],
    requiresDamageSignal: false,
    description:
      '반응망 중간부의 활성형 노드가 중심 출력 노드의 생성을 구동하는 전환 엣지.',
  },
  {
    id: 'r5-conversion',
    label: 'Thrombin + Fibrinogen → Fibrin',
    kind: 'conversion',
    rate: 0.85,
    reactants: [{ entityId: 'fibrinogen', weight: 1, consumed: true }],
    products: [{ entityId: 'fibrin', weight: 1 }],
    modulators: [{ entityId: 'thrombin', mode: 'catalyst', weight: 1, floor: 0 }],
    requiresDamageSignal: false,
    description:
      '구조 엣지. 중심 출력 노드가 종단 메시 노드의 조립을 구동한다.',
  },
  {
    id: 'i1-inhibition',
    label: 'TFPI ⊣ Factor Xa',
    kind: 'inhibition',
    rate: 0.6,
    reactants: [{ entityId: 'factorXa', weight: 1, consumed: true }],
    products: [],
    modulators: [{ entityId: 'tfpi', mode: 'catalyst', weight: 1, floor: 0 }],
    requiresDamageSignal: false,
    description:
      '억제 엣지. 첫 번째 억제 노드에 비례해 반응망 중간부의 활성형 노드를 제거한다.',
  },
  {
    id: 'i2-inhibition',
    label: 'Antithrombin ⊣ Thrombin',
    kind: 'inhibition',
    rate: 0.7,
    reactants: [{ entityId: 'thrombin', weight: 1, consumed: true }],
    products: [],
    modulators: [
      { entityId: 'antithrombin', mode: 'catalyst', weight: 1, floor: 0 },
    ],
    requiresDamageSignal: false,
    description:
      '억제 엣지. 두 번째 억제 노드에 비례해 중심 출력 노드를 제거한다.',
  },
] as const;

export const REACTION_IDS: readonly string[] = REACTION_DEFINITIONS.map((r) => r.id);

const REACTION_MAP: ReadonlyMap<string, ReactionDefinition> = new Map(
  REACTION_DEFINITIONS.map((r) => [r.id, r] as const),
);

export function getReaction(id: string): ReactionDefinition {
  const reaction = REACTION_MAP.get(id);
  if (!reaction) {
    throw new RangeError(`알 수 없는 반응 id: ${id}`);
  }
  return reaction;
}

/** 어떤 역할로든 반응에 참여하는 모든 엔티티. */
export function reactionParticipants(
  reaction: ReactionDefinition,
): readonly EntityId[] {
  const participants = new Set<EntityId>();
  for (const reactant of reaction.reactants) participants.add(reactant.entityId);
  for (const product of reaction.products) participants.add(product.entityId);
  for (const modulator of reaction.modulators) participants.add(modulator.entityId);
  return [...participants];
}

/** 주어진 엔티티가 어떤 역할로든 등장하는 반응들. */
export function reactionsInvolving(id: EntityId): readonly ReactionDefinition[] {
  return REACTION_DEFINITIONS.filter((reaction) =>
    reactionParticipants(reaction).includes(id),
  );
}

/**
 * 접근성 텍스트 미러와 2D 오버레이를 위해 평탄화한 엣지 목록.
 * 억제가 색만으로 암시되는 일이 없도록 조절자 엣지도 함께 포함한다.
 */
export interface GraphEdge {
  readonly reactionId: string;
  readonly from: EntityId;
  readonly to: EntityId;
  readonly relation: 'consumes' | 'produces' | 'catalyzes' | 'inhibits';
}

export const GRAPH_EDGES: readonly GraphEdge[] = REACTION_DEFINITIONS.flatMap(
  (reaction) => {
    const edges: GraphEdge[] = [];
    for (const reactant of reaction.reactants) {
      for (const product of reaction.products) {
        edges.push({
          reactionId: reaction.id,
          from: reactant.entityId,
          to: product.entityId,
          relation: 'produces',
        });
      }
      if (reaction.products.length === 0) {
        edges.push({
          reactionId: reaction.id,
          from: reactant.entityId,
          to: reactant.entityId,
          relation: 'consumes',
        });
      }
    }
    for (const modulator of reaction.modulators) {
      for (const product of reaction.products.length > 0
        ? reaction.products
        : reaction.reactants) {
        edges.push({
          reactionId: reaction.id,
          from: modulator.entityId,
          to: product.entityId,
          relation:
            modulator.mode === 'inhibitor' || reaction.kind === 'inhibition'
              ? 'inhibits'
              : 'catalyzes',
        });
      }
    }
    return edges;
  },
);
