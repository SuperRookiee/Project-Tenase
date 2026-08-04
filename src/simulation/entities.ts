/**
 * 추상 엔티티 레지스트리.
 *
 * 아래 이름들은 가상의 교육용 그래프에 있는 노드의 라벨이다. 실제 분자를 모형화한
 * 것이 아니며, 여기 있는 어떤 숫자도 생화학 상수가 아니다. 모두 시각화가 잘 읽히도록
 * 고른 0–1 척도의 무차원 조정값이다.
 *
 * 노드 이름과 축약 코드는 그래프의 식별자 역할을 하므로 영문 표기를 유지한다.
 * 설명은 모두 한국어다.
 */
import type {
  EntityDefinition,
  EntityId,
  EntityKind,
  EntityLevels,
  EntityFlags,
} from './types';

export const ENTITY_DEFINITIONS: readonly EntityDefinition[] = [
  {
    id: 'factorIX',
    label: 'Factor IX',
    shortCode: 'IX',
    glyph: '●',
    role: '상류 전구 노드. 공급 설정값 근처를 유지하다가, 손상 신호가 개시 엣지를 열면 소모되며 줄어든다.',
    kind: 'precursor',
    behavior: 'reservoir',
    clearance: 0.0,
    replenishment: 0.35,
    defaultSupply: 0.7,
    color: '#5eead4',
    shape: 'sphere',
    particleWeight: 1.1,
    renderAsParticles: true,
  },
  {
    id: 'factorIXa',
    label: 'Factor IXa',
    shortCode: 'IXa',
    glyph: '◆',
    role: '상류 전구 노드의 활성형. 개시 엣지에서 생성되고, 보조인자와 결합할 때 소모된다.',
    kind: 'activated',
    behavior: 'transient',
    clearance: 0.22,
    replenishment: 0.0,
    defaultSupply: 0.0,
    color: '#2dd4bf',
    shape: 'octahedron',
    particleWeight: 1.0,
    renderAsParticles: true,
  },
  {
    id: 'factorVIIIa',
    label: 'Factor VIIIa',
    shortCode: 'VIIIa',
    glyph: '◇',
    role: '보조인자 노드. 활성화된 상류 노드와 짝을 이뤄 복합체를 조립한다.',
    kind: 'cofactor',
    behavior: 'reservoir',
    clearance: 0.0,
    replenishment: 0.4,
    defaultSupply: 0.6,
    color: '#a78bfa',
    shape: 'tetrahedron',
    particleWeight: 0.9,
    renderAsParticles: true,
  },
  {
    id: 'tenaseComplex',
    label: 'Tenase Complex',
    shortCode: 'TEN',
    glyph: '⬡',
    role: '조립된 복합체 노드로, 이 프로젝트 이름의 유래다. 촉매 허브로 작용해 하류 전환 엣지를 가속하지만 그 과정에서 소모되지는 않는다.',
    kind: 'complex',
    behavior: 'transient',
    clearance: 0.18,
    replenishment: 0.0,
    defaultSupply: 0.0,
    color: '#f0abfc',
    shape: 'icosahedron',
    particleWeight: 0.7,
    renderAsParticles: true,
  },
  {
    id: 'factorX',
    label: 'Factor X',
    shortCode: 'X',
    glyph: '■',
    role: '반응망 중간부의 전구 노드. 복합체에 의해 활성형으로 전환된다.',
    kind: 'precursor',
    behavior: 'reservoir',
    clearance: 0.0,
    replenishment: 0.35,
    defaultSupply: 0.7,
    color: '#7dd3fc',
    shape: 'box',
    particleWeight: 1.1,
    renderAsParticles: true,
  },
  {
    id: 'factorXa',
    label: 'Factor Xa',
    shortCode: 'Xa',
    glyph: '◼',
    role: '반응망 중간부의 활성형 노드. 하류 전환 엣지를 구동하며, 첫 번째 억제 엣지의 대상이다.',
    kind: 'activated',
    behavior: 'transient',
    clearance: 0.2,
    replenishment: 0.0,
    defaultSupply: 0.0,
    color: '#38bdf8',
    shape: 'box',
    particleWeight: 1.0,
    renderAsParticles: true,
  },
  {
    id: 'prothrombin',
    label: 'Prothrombin',
    shortCode: 'PT',
    glyph: '▲',
    role: '그래프의 출력 단계로 흘러 들어가는 하류 전구 노드.',
    kind: 'precursor',
    behavior: 'reservoir',
    clearance: 0.0,
    replenishment: 0.35,
    defaultSupply: 0.75,
    color: '#fdba74',
    shape: 'cone',
    particleWeight: 1.1,
    renderAsParticles: true,
  },
  {
    id: 'thrombin',
    label: 'Thrombin',
    shortCode: 'THR',
    glyph: '★',
    role: '그래프의 중심 출력 노드. 구조 조립을 구동하며, 두 번째 억제 엣지의 대상이다.',
    kind: 'activated',
    behavior: 'transient',
    clearance: 0.16,
    replenishment: 0.0,
    defaultSupply: 0.0,
    color: '#fb923c',
    shape: 'octahedron',
    particleWeight: 1.0,
    renderAsParticles: true,
  },
  {
    id: 'fibrinogen',
    label: 'Fibrinogen',
    shortCode: 'FGN',
    glyph: '▬',
    role: '구조 전구 노드. 반응망이 메시를 조립하면서 소모된다.',
    kind: 'precursor',
    behavior: 'reservoir',
    clearance: 0.0,
    replenishment: 0.3,
    defaultSupply: 0.8,
    color: '#fda4af',
    shape: 'capsule',
    particleWeight: 1.2,
    renderAsParticles: true,
  },
  {
    id: 'fibrin',
    label: 'Fibrin',
    shortCode: 'FIB',
    glyph: '✚',
    role: '종단 구조 노드. 축적되며, 3D 장면에서 자라나는 메시로 그려진다.',
    kind: 'structural',
    behavior: 'terminal',
    clearance: 0.02,
    replenishment: 0.0,
    defaultSupply: 0.0,
    color: '#f43f5e',
    shape: 'capsule',
    particleWeight: 0.4,
    renderAsParticles: false,
  },
  {
    id: 'tfpi',
    label: 'TFPI',
    shortCode: 'TFPI',
    glyph: '▽',
    role: '억제 노드. 반응망 중간부의 활성형 노드를 만들어 내는 엣지를 약화시키고, 그 노드를 직접 제거하기도 한다.',
    kind: 'inhibitor',
    behavior: 'reservoir',
    clearance: 0.0,
    replenishment: 0.45,
    defaultSupply: 0.3,
    color: '#facc15',
    shape: 'torus',
    particleWeight: 0.8,
    renderAsParticles: true,
  },
  {
    id: 'antithrombin',
    label: 'Antithrombin',
    shortCode: 'AT',
    glyph: '▼',
    role: '억제 노드. 중심 출력 노드를 제거해 구조 단계를 약화시킨다.',
    kind: 'inhibitor',
    behavior: 'reservoir',
    clearance: 0.0,
    replenishment: 0.45,
    defaultSupply: 0.45,
    color: '#eab308',
    shape: 'torus',
    particleWeight: 0.8,
    renderAsParticles: true,
  },
  {
    id: 'platelets',
    label: 'Platelets',
    shortCode: 'PLT',
    glyph: '⬢',
    role: '추상 표면 노드. 여러 엣지가 요구하는 조립 표면을 제공하며, 표시 영역 근처에 납작한 원반으로 그려진다.',
    kind: 'surface',
    behavior: 'reservoir',
    clearance: 0.0,
    replenishment: 0.5,
    defaultSupply: 0.65,
    color: '#c4b5fd',
    shape: 'capsule',
    particleWeight: 0.6,
    renderAsParticles: false,
  },
] as const;

/** 노드 분류의 한국어 표시명. 범례와 인스펙터가 함께 사용한다. */
export const ENTITY_KIND_LABELS: Readonly<Record<EntityKind, string>> = {
  precursor: '전구 노드',
  activated: '활성형 노드',
  cofactor: '보조인자',
  complex: '복합체',
  inhibitor: '억제 노드',
  structural: '구조 노드',
  surface: '표면 노드',
};

export const ENTITY_IDS: readonly EntityId[] = ENTITY_DEFINITIONS.map((e) => e.id);

const ENTITY_MAP: ReadonlyMap<EntityId, EntityDefinition> = new Map(
  ENTITY_DEFINITIONS.map((e) => [e.id, e] as const),
);

export function getEntity(id: EntityId): EntityDefinition {
  const definition = ENTITY_MAP.get(id);
  if (!definition) {
    throw new RangeError(`알 수 없는 엔티티 id: ${String(id)}`);
  }
  return definition;
}

export function isEntityId(value: unknown): value is EntityId {
  return typeof value === 'string' && ENTITY_MAP.has(value as EntityId);
}

/** 모든 엔티티에 동일한 값을 담은 수준 레코드를 만든다. */
export function createLevels(value = 0): EntityLevels {
  const levels = {} as EntityLevels;
  for (const id of ENTITY_IDS) {
    levels[id] = value;
  }
  return levels;
}

/** 각 엔티티의 기본값으로 기본 공급값 레코드를 만든다. */
export function createDefaultSupply(): EntityLevels {
  const supply = {} as EntityLevels;
  for (const definition of ENTITY_DEFINITIONS) {
    supply[definition.id] = definition.defaultSupply;
  }
  return supply;
}

/** 모든 엔티티가 켜진 상태의 활성화 플래그 레코드를 만든다. */
export function createDefaultFlags(enabled = true): EntityFlags {
  const flags = {} as EntityFlags;
  for (const id of ENTITY_IDS) {
    flags[id] = enabled;
  }
  return flags;
}

/**
 * 시작 수준. 저장형 노드는 공급값에서 시작하고, 일시형과 종단형 노드는 0에서
 * 시작하므로 모든 실행은 조용한 반응망에서 출발한다.
 */
export function createInitialLevels(supply: EntityLevels): EntityLevels {
  const levels = {} as EntityLevels;
  for (const definition of ENTITY_DEFINITIONS) {
    levels[definition.id] =
      definition.behavior === 'reservoir' ? supply[definition.id] : 0;
  }
  return levels;
}
