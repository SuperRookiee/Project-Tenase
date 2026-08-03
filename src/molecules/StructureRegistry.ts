import { ENTITY_IDS, getEntity, isEntityId } from '@/simulation/entities';
import type { EntityId } from '@/simulation/types';
import type { StructureDescriptor, StructureEvidence } from './types';

/** 근거 등급의 한국어 표시명. 인스펙터와 구조 출처 패널이 함께 사용한다. */
export const STRUCTURE_EVIDENCE_LABELS: Readonly<Record<StructureEvidence, string>> = {
  experimental: '실험 구조',
  predicted: '예측 구조',
  'isolated-domain': '분리된 도메인',
  'representative-homolog': '대표 상동체',
  'conceptual-fallback': '개념 대체 표시',
};

const fallback = (moleculeId: EntityId, notes: string): StructureDescriptor => ({
  moleculeId,
  displayName: getEntity(moleculeId).label,
  source: 'unavailable',
  evidence: 'conceptual-fallback',
  notes,
  confidence: 'low',
});

/**
 * 확인을 거친 분자 구조 메타데이터.
 *
 * descriptor는 근거를 적어 둔 메타데이터일 뿐, 시뮬레이션 노드가 생리학적 분자
 * 모델이라는 주장이 아니다.
 *
 * Phase 1–2의 실시간 장면에 실제로 불러오는 것은 6MV4 하나뿐이다. 나머지 accession은
 * 나중에 명시적으로 지연 로딩할 때를 위한 레지스트리 경계를 잡아 둔 것이다.
 */
const CURATED_STRUCTURES: readonly StructureDescriptor[] = [
  {
    moleculeId: 'factorIXa',
    displayName: 'Factor IXa 실험 구조',
    source: 'local',
    evidence: 'experimental',
    accession: '6MV4',
    format: 'mmcif',
    localUrl: '/structures/6mv4.cif',
    biologicalState: '실험 결정 구조. 등록된 assembly의 heavy chain과 light chain을 담고 있다.',
    chains: ['A', 'B'],
    domains: ['Serine protease 도메인', 'EGF 유사 light chain 조각'],
    activeSites: [],
    notes: '1.37 Å X-ray 구조다. 함께 담아 둔 mmCIF은 RCSB PDB에서 받아 온 오프라인 사본이다.',
    confidence: 'high',
    provenanceUrl: 'https://www.rcsb.org/structure/6MV4',
  },
  {
    moleculeId: 'factorVIIIa',
    displayName: 'Factor VIII 도메인 결손 구조',
    source: 'rcsb-pdb',
    evidence: 'isolated-domain',
    accession: '3CDZ',
    format: 'mmcif',
    biologicalState: 'B 도메인을 덜어 낸 실험용 구성체.',
    chains: ['A'],
    domains: ['A1', 'A2', 'A3', 'C1', 'C2'],
    activeSites: [],
    notes: 'Phase 2에서는 레지스트리 메타데이터로만 존재한다. 실시간 장면으로 내려받지 않는다.',
    confidence: 'medium',
    provenanceUrl: 'https://www.rcsb.org/structure/3CDZ',
  },
  {
    moleculeId: 'factorXa',
    displayName: 'Factor Xa 실험 구조',
    source: 'rcsb-pdb',
    evidence: 'experimental',
    accession: '1F0R',
    format: 'mmcif',
    biologicalState: '억제자가 결합한 상태의 실험 구조.',
    chains: ['A', 'B'],
    domains: ['Protease 도메인'],
    activeSites: [],
    notes: '레지스트리 메타데이터로만 존재한다. 결합 상태를 완전한 생리학적 Factor Xa 모델로 제시하지 않는다.',
    confidence: 'medium',
    provenanceUrl: 'https://www.rcsb.org/structure/1F0R',
  },
  {
    moleculeId: 'thrombin',
    displayName: 'alpha-Thrombin 실험 구조',
    source: 'rcsb-pdb',
    evidence: 'experimental',
    accession: '1PPB',
    format: 'mmcif',
    biologicalState: '억제자가 결합한 상태의 실험 구조.',
    chains: ['A', 'B'],
    domains: ['Serine protease 도메인'],
    activeSites: [],
    notes: '레지스트리 메타데이터로만 존재한다. 애플리케이션이 잔기 주석을 추정하는 일은 없다.',
    confidence: 'medium',
    provenanceUrl: 'https://www.rcsb.org/structure/1PPB',
  },
  {
    moleculeId: 'antithrombin',
    displayName: 'Antithrombin 실험 구조',
    source: 'rcsb-pdb',
    evidence: 'experimental',
    accession: '1AZX',
    format: 'mmcif',
    biologicalState: 'serpin 계열의 실험 구조.',
    chains: ['I'],
    domains: ['Serpin fold'],
    activeSites: [],
    notes: 'Phase 2에서는 레지스트리 메타데이터로만 존재한다.',
    confidence: 'medium',
    provenanceUrl: 'https://www.rcsb.org/structure/1AZX',
  },
];

const EXPLICIT_FALLBACKS: ReadonlyMap<EntityId, StructureDescriptor> = new Map(
  ENTITY_IDS.filter((id) => !CURATED_STRUCTURES.some((item) => item.moleculeId === id)).map(
    (id) => [
      id,
      fallback(
        id,
        id === 'platelets' || id === 'fibrin'
          ? '이 시뮬레이션 엔티티는 의도적으로 분자가 아닌 custom shape으로 그린다.'
          : 'Phase 2에서는 확인된 구조를 배정하지 않았다. 뷰포트는 이름을 붙인 개념 표식을 쓴다.',
      ),
    ],
  ),
);

export class StructureRegistry {
  readonly #descriptors: ReadonlyMap<EntityId, StructureDescriptor>;

  constructor(descriptors: readonly StructureDescriptor[] = CURATED_STRUCTURES) {
    const map = new Map<EntityId, StructureDescriptor>(EXPLICIT_FALLBACKS);
    for (const descriptor of descriptors) {
      if (!isEntityId(descriptor.moleculeId)) {
        throw new RangeError(`알 수 없는 구조 분자 id: ${String(descriptor.moleculeId)}`);
      }
      if (descriptor.accession && !/^[A-Z0-9_]{4,16}$/.test(descriptor.accession)) {
        throw new RangeError(`형식에 맞지 않는 구조 accession: ${descriptor.accession}`);
      }
      map.set(descriptor.moleculeId, descriptor);
    }
    this.#descriptors = map;
  }

  resolve(moleculeId: EntityId): StructureDescriptor {
    return this.#descriptors.get(moleculeId) ?? fallback(moleculeId, '레지스트리에 등록된 항목이 없다.');
  }

  list(): readonly StructureDescriptor[] {
    return ENTITY_IDS.map((id) => this.resolve(id));
  }

  loadableForLiveScene(): readonly StructureDescriptor[] {
    return this.list().filter((item) => item.localUrl !== undefined);
  }
}

export const structureRegistry = new StructureRegistry();
