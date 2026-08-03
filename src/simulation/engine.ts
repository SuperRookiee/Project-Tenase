/**
 * 추상 네트워크 엔진.
 *
 * `reactions.ts`의 반응 그래프 위에서 동작하는 결정론적 고정 스텝 적분기다.
 * 무작위성이 전혀 없고, I/O를 수행하지 않으며, 브라우저 API를 건드리지 않고,
 * 오직 0–1 범위의 무차원 값만 만들어 낸다.
 *
 * 중요: 이것은 *시각적 시스템 모델*이다. 적분 방식, 속도 상수, 평활화 상수는
 * 애니메이션이 화면에서 잘 읽히도록 고른 값이다. 생물학의 그 무엇에서 유도한
 * 것도, 그에 맞춰 보정한 것도, 그것으로 검증한 것도 아니며, 출력값은 어떤
 * 종류의 측정값도 아니다.
 */
import {
  ENTITY_DEFINITIONS,
  ENTITY_IDS,
  createDefaultFlags,
  createDefaultSupply,
  createInitialLevels,
} from './entities';
import { assertNormalized, clamp01, lerp } from './numeric';
import { REACTION_DEFINITIONS, reactionParticipants } from './reactions';
import {
  RingBuffer,
  SNAPSHOT_INTERVAL_TICKS,
  createEventBuffer,
  createSnapshotBuffer,
} from './snapshots';
import type {
  ActiveBinding,
  DerivedSignals,
  EntityFlags,
  EntityId,
  EntityLevels,
  ReactionDefinition,
  ReactionEvent,
  SimulationConfig,
  SimulationEngine,
  SimulationSnapshot,
  SimulationState,
} from './types';

/** 추상 모델 시간의 고정 스텝 하나. 무차원이다. */
export const FIXED_STEP = 1 / 60;
/** `simulationSpeed`가 1.0일 때 대응되는 스텝 배율. */
export const MAX_SPEED_MULTIPLIER = 4;
/** 애니메이션 프레임당 따라잡기 작업량의 상한. */
export const MAX_STEPS_PER_FRAME = 8;
/** 이 값을 넘는 프레임 델타는 탭 복귀로 읽고 잘라낸다. */
export const MAX_FRAME_DELTA_SECONDS = 0.25;
/** 하나의 이산적인 추상 이벤트를 이루는 누적 회전량. */
export const EVENT_QUANTUM = 0.02;
/** 한 반응이 한 스텝에서 방출할 수 있는 이벤트 수. */
const MAX_EVENTS_PER_REACTION_PER_STEP = 4;
/** 합산 유량을 0–1 강도 척도로 옮기는 제수. */
const ACTIVATION_REFERENCE = 1.2;
const INHIBITION_REFERENCE = 0.6;
/** 강도 신호에 적용하는 지수 평활화 계수. */
const SIGNAL_SMOOTHING = 0.12;
/** 비활성화된 일시형 노드에 추가로 적용하는 감쇠. */
const DISABLED_DECAY = 2;
/** 이 값보다 낮은 반응 활동은 비활성으로 친다. */
export const ACTIVITY_EPSILON = 1e-4;

/**
 * 참여 노드를 한 번만 미리 계산해 둔다. `reactionParticipants`는 메모리를
 * 할당하는데, 스텝 루프가 매 틱마다 모든 반응에 대해 이 값을 참조한다.
 */
const REACTION_PARTICIPANTS: ReadonlyMap<string, readonly EntityId[]> = new Map(
  REACTION_DEFINITIONS.map(
    (reaction) => [reaction.id, reactionParticipants(reaction)] as const,
  ),
);

/**
 * 억제성 엣지가 겨냥하는 모든 노드에 대해, 그 노드를 제거하는 엣지들과 그 노드를
 * 생성하는 엣지들. 억제를 그 노드 자신의 회전량에 대한 노드별 비율로 표현하는 데
 * 쓰이며, 덕분에 신호가 그래프 다른 곳의 무관한 엣지에 좌우되지 않는다.
 */
interface InhibitionTarget {
  readonly targetId: EntityId;
  readonly removalIndices: readonly number[];
  readonly producingIndices: readonly number[];
}

const INHIBITION_TARGETS: readonly InhibitionTarget[] = (() => {
  const byTarget = new Map<EntityId, { removal: number[]; producing: number[] }>();

  REACTION_DEFINITIONS.forEach((reaction, index) => {
    if (reaction.kind !== 'inhibition') return;
    for (const reactant of reaction.reactants) {
      if (!reactant.consumed) continue;
      const entry = byTarget.get(reactant.entityId) ?? {
        removal: [],
        producing: [],
      };
      entry.removal.push(index);
      byTarget.set(reactant.entityId, entry);
    }
  });

  REACTION_DEFINITIONS.forEach((reaction, index) => {
    if (reaction.kind === 'inhibition') return;
    for (const product of reaction.products) {
      byTarget.get(product.entityId)?.producing.push(index);
    }
  });

  return [...byTarget].map(([targetId, entry]) => ({
    targetId,
    removalIndices: entry.removal,
    producingIndices: entry.producing,
  }));
})();

const NETWORK_ACTIVITY_WEIGHTS: ReadonlyArray<readonly [EntityId, number]> = [
  ['factorIXa', 0.15],
  ['tenaseComplex', 0.2],
  ['factorXa', 0.2],
  ['thrombin', 0.25],
  ['fibrin', 0.2],
];

export function createDefaultConfig(): SimulationConfig {
  return {
    supply: createDefaultSupply(),
    enabled: createDefaultFlags(true),
    vesselDamageSignal: 0.5,
    // 0.25 x 4 = 1.0배 스텝 배율.
    simulationSpeed: 0.25,
    particleDensity: 0.6,
  };
}

function emptySignals(): DerivedSignals {
  return {
    networkActivity: 0,
    activationIntensity: 0,
    inhibitionIntensity: 0,
    factorIXModelSignal: 0,
    factorXaModelSignal: 0,
    thrombinModelSignal: 0,
    fibrinModelSignal: 0,
    inhibitionModelSignal: 0,
    reactionEventCount: 0,
  };
}

/** 들어온 설정을 깊은 복사하고 검증한다. */
export function normalizeConfig(config: SimulationConfig): SimulationConfig {
  const supply = {} as EntityLevels;
  const enabled = {} as EntityFlags;
  for (const id of ENTITY_IDS) {
    supply[id] = assertNormalized(config.supply?.[id] ?? 0, `supply.${id}`);
    enabled[id] = config.enabled?.[id] !== false;
  }
  return {
    supply,
    enabled,
    vesselDamageSignal: assertNormalized(
      config.vesselDamageSignal,
      'vesselDamageSignal',
    ),
    simulationSpeed: assertNormalized(config.simulationSpeed, 'simulationSpeed'),
    particleDensity: assertNormalized(config.particleDensity, 'particleDensity'),
  };
}

class Engine implements SimulationEngine {
  private config: SimulationConfig;
  private levels: EntityLevels;
  private signals: DerivedSignals;
  private reactionActivity: Record<string, number> = {};
  private readonly eventAccumulator: Record<string, number> = {};
  private readonly snapshotBuffer: RingBuffer<SimulationSnapshot> =
    createSnapshotBuffer();
  private readonly eventBuffer: RingBuffer<ReactionEvent> = createEventBuffer();
  /** 반응 순서로 색인되는 스텝별 임시 버퍼. 할당을 피하려고 재사용한다. */
  private readonly stepFlux = new Float64Array(REACTION_DEFINITIONS.length);
  private readonly stepOpenFlux = new Float64Array(REACTION_DEFINITIONS.length);
  private tick = 0;
  private time = 0;
  private eventCount = 0;
  private eventSequence = 0;
  private accumulator = 0;

  constructor(config: SimulationConfig) {
    this.config = normalizeConfig(config);
    this.levels = createInitialLevels(this.config.supply);
    this.signals = emptySignals();
    this.resetTransient();
    this.recordSnapshot();
  }

  private resetTransient(): void {
    this.reactionActivity = {};
    for (const reaction of REACTION_DEFINITIONS) {
      this.reactionActivity[reaction.id] = 0;
      this.eventAccumulator[reaction.id] = 0;
    }
  }

  getConfig(): SimulationConfig {
    return this.config;
  }

  /**
   * 현재 상태의 실시간 뷰를 반환한다.
   *
   * `levels` 객체는 매 스텝 제자리에서 변경되므로 렌더 루프가 할당 없이 읽을 수
   * 있다. 그 값을 여러 프레임에 걸쳐 보관하는 호출자 — 예를 들어 React 스토어 —
   * 는 먼저 복사해야 한다.
   */
  getState(): SimulationState {
    return {
      tick: this.tick,
      time: this.time,
      levels: this.levels,
      signals: this.signals,
      reactionActivity: this.reactionActivity,
    };
  }

  configure(patch: Partial<SimulationConfig>): void {
    const next: SimulationConfig = {
      supply: patch.supply
        ? { ...this.config.supply, ...patch.supply }
        : this.config.supply,
      enabled: patch.enabled
        ? { ...this.config.enabled, ...patch.enabled }
        : this.config.enabled,
      vesselDamageSignal:
        patch.vesselDamageSignal ?? this.config.vesselDamageSignal,
      simulationSpeed: patch.simulationSpeed ?? this.config.simulationSpeed,
      particleDensity: patch.particleDensity ?? this.config.particleDensity,
    };
    this.config = normalizeConfig(next);
  }

  setSupply(id: EntityId, value: number): void {
    const validated = assertNormalized(value, `supply.${id}`);
    this.config = {
      ...this.config,
      supply: { ...this.config.supply, [id]: validated },
    };
  }

  setEnabled(id: EntityId, enabled: boolean): void {
    this.config = {
      ...this.config,
      enabled: { ...this.config.enabled, [id]: enabled === true },
    };
  }

  /** 반응의 모든 참여 노드가 켜져 있을 때 참이다. */
  private isReactionEnabled(reactionId: string): boolean {
    const participants = REACTION_PARTICIPANTS.get(reactionId);
    if (!participants) return false;
    for (const participant of participants) {
      if (!this.config.enabled[participant]) return false;
    }
    return true;
  }

  step(): void {
    const dt = FIXED_STEP;
    const { levels, config } = this;

    let activationFlux = 0;
    let inhibitionFlux = 0;

    for (let index = 0; index < REACTION_DEFINITIONS.length; index += 1) {
      const reaction = REACTION_DEFINITIONS[index];
      let flux = 0;
      // 다른 조건을 모두 고정한 채 억제성 조절자만 걷어냈다면 이 엣지가 실어
      // 날랐을 유량. 억제 비율 계산의 입력이 된다.
      let openFlux = 0;

      if (this.isReactionEnabled(reaction.id)) {
        openFlux = reaction.rate * dt;
        if (reaction.requiresDamageSignal) {
          openFlux *= config.vesselDamageSignal;
        }
        // 가용성: 소모 여부와 상관없이 모든 반응물이 엣지를 통제한다.
        for (const reactant of reaction.reactants) {
          openFlux *= levels[reactant.entityId];
        }

        let inhibitorFactor = 1;
        for (const modulator of reaction.modulators) {
          const level = levels[modulator.entityId];
          if (modulator.mode === 'catalyst') {
            openFlux *= modulator.floor + (1 - modulator.floor) * level;
          } else {
            inhibitorFactor *= 1 - modulator.weight * level;
          }
        }
        if (openFlux < 0) openFlux = 0;
        if (inhibitorFactor < 0) inhibitorFactor = 0;

        flux = openFlux * inhibitorFactor;

        // 용량 범위 제한이 사후 보정 없이 모든 수준을 0–1 안에 묶어 둔다.
        let limit = Number.POSITIVE_INFINITY;
        for (const reactant of reaction.reactants) {
          if (!reactant.consumed) continue;
          const available = levels[reactant.entityId] / reactant.weight;
          if (available < limit) limit = available;
        }
        for (const product of reaction.products) {
          const headroom = (1 - levels[product.entityId]) / product.weight;
          if (headroom < limit) limit = headroom;
        }
        if (flux > limit) flux = limit;
        if (openFlux > limit) openFlux = limit;
        if (flux < 0) flux = 0;
        if (openFlux < flux) openFlux = flux;
      }

      for (const reactant of reaction.reactants) {
        if (!reactant.consumed) continue;
        levels[reactant.entityId] = clamp01(
          levels[reactant.entityId] - flux * reactant.weight,
        );
      }
      for (const product of reaction.products) {
        levels[product.entityId] = clamp01(
          levels[product.entityId] + flux * product.weight,
        );
      }

      const activity = reaction.rate > 0 ? clamp01(flux / dt / reaction.rate) : 0;
      this.reactionActivity[reaction.id] = activity;

      this.stepFlux[index] = flux;
      this.stepOpenFlux[index] = openFlux;

      if (reaction.kind === 'inhibition') {
        inhibitionFlux += flux;
      } else {
        activationFlux += flux;
      }

      this.accumulateEvents(reaction, flux, activity);
    }

    // 기본 회전량: 저장형은 공급값 쪽으로 완화되고, 일시형은 감쇠한다.
    for (const definition of ENTITY_DEFINITIONS) {
      const id = definition.id;
      const isEnabled = config.enabled[id];
      let level = levels[id];

      if (definition.behavior === 'reservoir') {
        const target = isEnabled ? config.supply[id] : 0;
        const rate = isEnabled
          ? definition.replenishment
          : definition.replenishment + DISABLED_DECAY;
        level += (target - level) * rate * dt;
      } else {
        const decay = isEnabled
          ? definition.clearance
          : definition.clearance + DISABLED_DECAY;
        level -= level * decay * dt;
      }

      levels[id] = clamp01(level);
    }

    this.tick += 1;
    this.time += dt;
    this.updateSignals(
      activationFlux / dt,
      inhibitionFlux / dt,
      this.computeInhibitionShare(),
    );

    if (this.tick % SNAPSHOT_INTERVAL_TICKS === 0) {
      this.recordSnapshot();
    }
  }

  private accumulateEvents(
    reaction: ReactionDefinition,
    flux: number,
    magnitude: number,
  ): void {
    if (flux <= 0) return;
    const reactionId = reaction.id;

    let accumulated = (this.eventAccumulator[reactionId] ?? 0) + flux;
    let emitted = 0;
    while (
      accumulated >= EVENT_QUANTUM &&
      emitted < MAX_EVENTS_PER_REACTION_PER_STEP
    ) {
      accumulated -= EVENT_QUANTUM;
      emitted += 1;
      this.eventSequence += 1;
      this.eventCount += 1;
      this.eventBuffer.push({
        id: `${reactionId}:${this.tick}:${this.eventSequence}`,
        tick: this.tick,
        time: this.time,
        reactionId,
        reactionLabel: reaction.label,
        kind: reaction.kind,
        magnitude: clamp01(magnitude),
        sourceEntityIds: reaction.reactants.map((r) => r.entityId),
        targetEntityIds:
          reaction.products.length > 0
            ? reaction.products.map((p) => p.entityId)
            : reaction.reactants.map((r) => r.entityId),
      });
    }
    this.eventAccumulator[reactionId] = accumulated;
  }

  /**
   * 억제 노드들이 억제 대상 노드 각각의 회전량 중 얼마나 걷어내고 있는지를 그
   * 노드들에 대해 평균한 값이다.
   *
   * 대상 하나에 대해서는 다음과 같다.
   *
   *     (직접 제거된 양 + 그 노드의 생성 엣지에서 억눌린 양)
   *     ---------------------------------------------------------
   *     (억제되지 않았을 때의 생성량 + 직접 제거된 양)
   *
   * 이 비율의 범위를 한 노드 자신의 엣지로 한정한 덕분에 값이 얌전하게 움직인다.
   * 절대 억제 유량은 억제 노드 설정에 대해 단조롭지 *않다*. 첫 번째 억제 노드를
   * 높이면 하류 엣지들이 심하게 굶주려 중앙 출력 풀이 무너지고, 그 결과 두 번째
   * 억제 엣지를 지나는 유량이 오히려 줄어든다. 게다가 네트워크 전체를 기준으로
   * 삼은 비율은 무관한 엣지가 수준 상한에 포화될 때마다 추가로 튀어 오른다.
   * 여기서는 분자와 분모가 같은 풀에 비례해 함께 커지므로, 결과값은 두 억제 노드
   * 중 어느 쪽을 올려도 상승하고 그래프의 나머지 부분이 무엇을 하든 무시한다.
   */
  private computeInhibitionShare(): number {
    let total = 0;
    let counted = 0;

    for (const target of INHIBITION_TARGETS) {
      let removed = 0;
      for (const index of target.removalIndices) {
        removed += this.stepFlux[index];
      }

      let openProduction = 0;
      let suppressed = 0;
      for (const index of target.producingIndices) {
        openProduction += this.stepOpenFlux[index];
        suppressed += this.stepOpenFlux[index] - this.stepFlux[index];
      }

      const denominator = openProduction + removed;
      if (denominator <= 0) continue;

      total += (removed + suppressed) / denominator;
      counted += 1;
    }

    return counted > 0 ? total / counted : 0;
  }

  /**
   * @param activationRate  모델 시간 단위당 합산한 비억제성 유량
   * @param inhibitionRate  모델 시간 단위당 합산한 억제성 엣지 유량
   * @param inhibitionShare 이미 0–1 범위에 들어 있는 노드별 억제 비율
   */
  private updateSignals(
    activationRate: number,
    inhibitionRate: number,
    inhibitionShare: number,
  ): void {
    const previous = this.signals;

    const activationIntensity = lerp(
      previous.activationIntensity,
      clamp01(activationRate / ACTIVATION_REFERENCE),
      SIGNAL_SMOOTHING,
    );
    const inhibitionIntensity = lerp(
      previous.inhibitionIntensity,
      clamp01(inhibitionRate / INHIBITION_REFERENCE),
      SIGNAL_SMOOTHING,
    );

    // 차트에 그려지는 억제 신호는 절대 처리량이 아니라 억제 대상 노드 자신의
    // 회전량에 대한 *비율*이다. `computeInhibitionShare`를 참고할 것.
    const inhibitionModelSignal = lerp(
      previous.inhibitionModelSignal,
      clamp01(inhibitionShare),
      SIGNAL_SMOOTHING,
    );

    let networkActivity = 0;
    for (const [id, weight] of NETWORK_ACTIVITY_WEIGHTS) {
      networkActivity += this.levels[id] * weight;
    }

    this.signals = {
      networkActivity: clamp01(networkActivity),
      activationIntensity: clamp01(activationIntensity),
      inhibitionIntensity: clamp01(inhibitionIntensity),
      factorIXModelSignal: clamp01(this.levels.factorIXa),
      factorXaModelSignal: clamp01(this.levels.factorXa),
      thrombinModelSignal: clamp01(this.levels.thrombin),
      fibrinModelSignal: clamp01(this.levels.fibrin),
      inhibitionModelSignal: clamp01(inhibitionModelSignal),
      reactionEventCount: this.eventCount,
    };
  }

  private recordSnapshot(): void {
    this.snapshotBuffer.push({
      tick: this.tick,
      time: this.time,
      levels: { ...this.levels },
      signals: { ...this.signals },
      reactionActivity: { ...this.reactionActivity },
    });
  }

  advance(deltaSeconds: number): number {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;

    const multiplier = this.config.simulationSpeed * MAX_SPEED_MULTIPLIER;
    if (multiplier <= 0) return 0;

    const clipped = Math.min(deltaSeconds, MAX_FRAME_DELTA_SECONDS);
    this.accumulator += clipped * multiplier;

    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
      this.step();
      this.accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (steps >= MAX_STEPS_PER_FRAME) {
      // 느린 프레임에서 밀린 작업이 눈덩이처럼 불어나게 두는 대신 그냥 버린다.
      this.accumulator = 0;
    }
    return steps;
  }

  reset(config?: SimulationConfig): void {
    if (config) {
      this.config = normalizeConfig(config);
    }
    this.levels = createInitialLevels(this.config.supply);
    this.signals = emptySignals();
    this.tick = 0;
    this.time = 0;
    this.eventCount = 0;
    this.eventSequence = 0;
    this.accumulator = 0;
    this.snapshotBuffer.clear();
    this.eventBuffer.clear();
    this.resetTransient();
    this.recordSnapshot();
  }

  getSnapshots(): readonly SimulationSnapshot[] {
    return this.snapshotBuffer.toArray();
  }

  getEvents(): readonly ReactionEvent[] {
    return this.eventBuffer.toArray();
  }

  getActiveBindings(id: EntityId): readonly ActiveBinding[] {
    const bindings: ActiveBinding[] = [];
    for (const reaction of REACTION_DEFINITIONS) {
      const participants = REACTION_PARTICIPANTS.get(reaction.id) ?? [];
      if (!participants.includes(id)) continue;

      const strength = this.reactionActivity[reaction.id] ?? 0;
      if (strength <= ACTIVITY_EPSILON) continue;

      bindings.push({
        reactionId: reaction.id,
        reactionLabel: reaction.label,
        kind: reaction.kind,
        partnerEntityIds: participants.filter((participant) => participant !== id),
        strength: clamp01(strength),
      });
    }
    return bindings.sort((a, b) => b.strength - a.strength);
  }
}

export function createEngine(
  config: SimulationConfig = createDefaultConfig(),
): SimulationEngine {
  return new Engine(config);
}
