/**
 * Project Tenase — 공유 시뮬레이션 계약.
 *
 * 범위 고지
 * ---------
 * 이 모듈은 *가상의 시각적 시스템 모델*을 기술한다. 교육용 장난감이며, 노드가
 * 응고 생물학의 이름을 빌려 쓰지만 그것은 순전히 라벨일 뿐인 추상 방향 그래프다.
 * 여기 있는 어떤 것도 보정되거나 검증되지 않았고 생물학적으로 정확하지도 않다.
 *
 * 모든 양은 0.0–1.0으로 정규화된 척도의 무차원 숫자다. 농도도, 국제 단위도,
 * 질량도, 반감기도, 판정 기준값도, 시간 단위도 없다. `time`은 현실의 초가 아니라
 * 추상적인 "모델 시간 단위"로 표현된다.
 */

/** 반응망에 존재하는 모든 추상 엔티티의 식별자. */
export type EntityId =
  | 'factorIX'
  | 'factorIXa'
  | 'factorVIIIa'
  | 'tenaseComplex'
  | 'factorX'
  | 'factorXa'
  | 'prothrombin'
  | 'thrombin'
  | 'fibrinogen'
  | 'fibrin'
  | 'tfpi'
  | 'antithrombin'
  | 'platelets';

/** 범례와 스타일링에 쓰이는 대략적인 시각·의미 분류. */
export type EntityKind =
  | 'precursor'
  | 'activated'
  | 'cofactor'
  | 'complex'
  | 'inhibitor'
  | 'structural'
  | 'surface';

/**
 * 명시적인 반응 바깥에서 엔티티의 수준이 변해 가는 방식.
 *
 * - `reservoir` — 설정된 공급값을 향해 이완한다. 사용자가 슬라이더로 조절하는
 *   추상적 "가용량" 노드를 나타낸다.
 * - `transient` — 0에서 시작해 반응으로 생성되고, 자신의 소실률에 따라 0을 향해
 *   감쇠한다.
 * - `terminal` — 구조 생성물로 축적되며 아주 느리게만 소실된다.
 */
export type EntityBehavior = 'reservoir' | 'transient' | 'terminal';

/** 3D 레이어가 사용하는 개념적 형상. 분자 구조가 아니다. */
export type EntityShape =
  | 'sphere'
  | 'box'
  | 'octahedron'
  | 'tetrahedron'
  | 'icosahedron'
  | 'torus'
  | 'capsule'
  | 'cone';

export interface EntityDefinition {
  readonly id: EntityId;
  /** 표시 라벨. 이름일 뿐이며 현실 세계의 의미를 담지 않는다. */
  readonly label: string;
  /** 의미가 색에만 의존하지 않도록 중복해 두는 축약 코드. */
  readonly shortCode: string;
  /** 범례와 접근성 텍스트에 쓰이는, 색이 아닌 중복 기호. */
  readonly glyph: string;
  /** 그래프 안에서 이 노드가 맡는 추상 역할의 평이한 설명. */
  readonly role: string;
  readonly kind: EntityKind;
  readonly behavior: EntityBehavior;
  /** 모델 시간 한 단위당 감쇠 비율. 무차원, 0–1. */
  readonly clearance: number;
  /** 공급 목표를 향한 이완 속도. 무차원, 0–1. */
  readonly replenishment: number;
  /** 균형 잡힌 반응망 프리셋이 사용하는 기본 정규화 공급값. */
  readonly defaultSupply: number;
  /** 3D 레이어와 차트에서 쓰는 hex 색상. */
  readonly color: string;
  readonly shape: EntityShape;
  /** 전역 입자 예산에 대한 상대적 지분. */
  readonly particleWeight: number;
  /** 이 엔티티를 자유롭게 떠다니는 입자로 그릴지 여부. */
  readonly renderAsParticles: boolean;
}

/** 모든 엔티티의 정규화 수준. 모든 값은 0–1 안에 있다. */
export type EntityLevels = Record<EntityId, number>;
/** 모든 엔티티의 활성화 플래그. */
export type EntityFlags = Record<EntityId, boolean>;

export type ReactionKind = 'activation' | 'binding' | 'conversion' | 'inhibition';

/** 반응이 소비하는(또는 단지 요구하는) 반응물. */
export interface ReactionReactant {
  readonly entityId: EntityId;
  /** 화학량론적 가중치. 추상적이고 무차원이다. */
  readonly weight: number;
  /** 참이면 반응이 진행되면서 이 반응물이 소모된다. */
  readonly consumed: boolean;
}

export interface ReactionProduct {
  readonly entityId: EntityId;
  readonly weight: number;
}

/**
 * 소비되지 않으면서 반응의 세기를 조절하는 엔티티.
 *
 * - `catalyst` — `floor + (1 - floor) * level`만큼 기여한다. `floor`가 0이면
 *   해당 조절자가 반드시 있어야 한다는 뜻이 된다.
 * - `inhibitor` — `1 - weight * level`만큼 기여하므로, 가중치 1인 억제자가 가득
 *   차 있으면 반응이 완전히 멈춘다.
 */
export interface ReactionModulator {
  readonly entityId: EntityId;
  readonly mode: 'catalyst' | 'inhibitor';
  readonly weight: number;
  readonly floor: number;
}

export interface ReactionDefinition {
  readonly id: string;
  readonly label: string;
  readonly kind: ReactionKind;
  /** 추상적인 회전 속도. 무차원이다. */
  readonly rate: number;
  readonly reactants: readonly ReactionReactant[];
  readonly products: readonly ReactionProduct[];
  readonly modulators: readonly ReactionModulator[];
  /** 참이면 이 반응은 관 손상 신호에 의해 열린다. */
  readonly requiresDamageSignal: boolean;
  /** 추상적 관계에 대한 평이한 설명. */
  readonly description: string;
}

/** 사용자가 조절하며 완전히 정규화된 설정값. */
export interface SimulationConfig {
  /** 엔티티별 가용량 목표, 0–1. */
  readonly supply: EntityLevels;
  /** 엔티티별 참여 스위치. */
  readonly enabled: EntityFlags;
  /** 손상 영역에 대한 추상 개시 신호, 0–1. */
  readonly vesselDamageSignal: number;
  /** 정규화 속도, 0–1. 내부적으로 0–4배 스텝 배율에 대응한다. */
  readonly simulationSpeed: number;
  /** 정규화 입자 밀도, 0–1. 화면에 보이는 입자 예산을 조절한다. */
  readonly particleDensity: number;
}

/**
 * 중립적인 비임상 출력 신호. `reactionEventCount`를 제외한 모든 필드는 0–1
 * 범위의 무차원 값이다.
 */
export interface DerivedSignals {
  /** 반응망 전반의 추상 활동을 합산한 값. */
  readonly networkActivity: number;
  /** 활성화·결합·전환 유량의 크기를 평활화한 값. */
  readonly activationIntensity: number;
  /**
   * 억제 유량 절댓값을 평활화한 값. 장면의 억제 애니메이션을 구동한다. 이것은
   * 처리량 지표이므로, 억제가 작용하는 풀 자체가 고갈되면 함께 떨어진다는 점에
   * 유의한다. 억제 설정에 대해 단조롭게 증가하는 지표는 `inhibitionModelSignal`을
   * 참고할 것.
   */
  readonly inhibitionIntensity: number;
  /** Factor IX 노드의 활성형. */
  readonly factorIXModelSignal: number;
  readonly factorXaModelSignal: number;
  readonly thrombinModelSignal: number;
  readonly fibrinModelSignal: number;
  /**
   * 억제 노드가 현재 걷어내고 있는 반응망 잠재 처리량의 비율. 직접 제거되는
   * 유량과 다른 엣지에서 억눌린 유량을 함께 센다. 두 억제 노드 중 어느 쪽을
   * 올려도 이 값이 상승한다.
   */
  readonly inhibitionModelSignal: number;
  /** 개별 추상 반응 이벤트의 누적 개수. 정규화되지 않은 값이다. */
  readonly reactionEventCount: number;
}

export interface ReactionEvent {
  /** 결정론적 식별자 — 엔진은 무작위성을 전혀 쓰지 않는다. */
  readonly id: string;
  readonly tick: number;
  readonly time: number;
  readonly reactionId: string;
  readonly reactionLabel: string;
  readonly kind: ReactionKind;
  /** 이벤트의 정규화된 0–1 크기. */
  readonly magnitude: number;
  readonly sourceEntityIds: readonly EntityId[];
  readonly targetEntityIds: readonly EntityId[];
}

/** 인스펙터 패널에 드러나는 활성 결합. */
export interface ActiveBinding {
  readonly reactionId: string;
  readonly reactionLabel: string;
  readonly kind: ReactionKind;
  readonly partnerEntityIds: readonly EntityId[];
  /** 지금 이 순간 상호작용의 정규화된 0–1 세기. */
  readonly strength: number;
}

export interface SimulationState {
  readonly tick: number;
  /** 경과한 추상 모델 시간 단위. 현실의 초가 아니다. */
  readonly time: number;
  readonly levels: EntityLevels;
  readonly signals: DerivedSignals;
  /** 가장 최근 스텝에 대한 반응별 정규화 0–1 활동도. */
  readonly reactionActivity: Readonly<Record<string, number>>;
}

export interface SimulationSnapshot {
  readonly tick: number;
  readonly time: number;
  readonly levels: EntityLevels;
  readonly signals: DerivedSignals;
  /** 이 snapshot의 반응별 활동도. 3D 흐름과 Inspector replay에 사용한다. */
  readonly reactionActivity: Readonly<Record<string, number>>;
}

/**
 * 시뮬레이션 엔진 계약.
 *
 * 구현체는 결정론적이어야 한다. 동일한 설정과 동일한 `step` 호출 순서는 반드시
 * 동일한 상태를 만들어야 한다. 엔진은 어떤 입출력도 하지 않고 브라우저 API에도
 * 손대지 않는다.
 */
export interface SimulationEngine {
  getConfig(): SimulationConfig;
  getState(): SimulationState;
  /** 부분 설정을 병합한다. 잘못된 숫자는 `RangeError`를 던진다. */
  configure(patch: Partial<SimulationConfig>): void;
  setSupply(id: EntityId, value: number): void;
  setEnabled(id: EntityId, enabled: boolean): void;
  /**
   * 그래프 바깥에서 한 노드의 현재 수준에 증분을 더한다.
   *
   * 공급 설정값을 바꾸는 `setSupply`와 달리 지금 이 순간의 수준만 밀어 올린다.
   * 그 뒤로는 그 노드의 평소 거동이 그대로 이어진다 — 저장형은 공급값 쪽으로
   * 되돌아가고 일시형은 자기 소실률로 감쇠한다. 결과는 0–1 안에 갇힌다.
   *
   * 추상 그래프의 한 노드를 밀어 보는 조작일 뿐이며, 어떤 절차나 제품에도
   * 대응하지 않는다.
   */
  applyInput(id: EntityId, amount: number): void;
  /** 추상 모델 시간을 정확히 한 고정 스텝만큼 진행한다. */
  step(): void;
  /**
   * `simulationSpeed`로 배율 조정된 실제 경과 시간만큼 진행하되, 온전한 고정
   * 스텝 단위로만 실행한다. 실행된 스텝 수를 반환한다.
   */
  advance(deltaSeconds: number): number;
  /** 초기 수준으로 되돌리고 이력을 비운다. 설정을 함께 교체할 수도 있다. */
  reset(config?: SimulationConfig): void;
  getSnapshots(): readonly SimulationSnapshot[];
  getEvents(): readonly ReactionEvent[];
  getActiveBindings(id: EntityId): readonly ActiveBinding[];
}
