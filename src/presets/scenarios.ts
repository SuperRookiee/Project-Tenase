/**
 * 시나리오 프리셋.
 *
 * 시각화를 위한 추상적인 교육용 출발점이다. 어떤 상태, 절차, 프로토콜, 제품,
 * 집단에도 대응하지 않으며 특정 인물에 관한 시나리오도 아니다. 각 프리셋은 그저
 * 무차원 0–1 슬라이더 몇 개를 옮겨 그래프가 눈에 띄게 다른 모양으로 자리 잡게 할
 * 뿐이다.
 */
import { createDefaultConfig } from '@/simulation/engine';
import { normalizeConfig } from '@/simulation/engine';
import type { EntityId, SimulationConfig } from '@/simulation/types';

export type PresetId =
  | 'balanced-network'
  | 'reduced-factor-ix'
  | 'increased-factor-ix'
  | 'increased-tfpi-inhibition'
  | 'reduced-antithrombin-activity'
  | 'combined-abstract-modifiers'
  | 'custom-sandbox';

export interface ScenarioPreset {
  readonly id: PresetId;
  readonly name: string;
  /** 이 프리셋이 그래프 관점에서 무엇을 바꾸는지. */
  readonly description: string;
  /** 화면에서 무엇을 볼지. 서술적일 뿐 결코 예측이 아니다. */
  readonly focus: string;
  readonly supplyOverrides: Partial<Record<EntityId, number>>;
  readonly vesselDamageSignal?: number;
}

export const SCENARIO_PRESETS: readonly ScenarioPreset[] = [
  {
    id: 'balanced-network',
    name: '균형 잡힌 네트워크',
    description:
      '모든 노드가 기본 공급값에 놓이고 손상 신호는 척도 중간에 있다.',
    focus:
      '그래프의 기준 형태. 다른 모든 프리셋은 이 형태에서 출발한 변형이다.',
    supplyOverrides: {},
  },
  {
    id: 'reduced-factor-ix',
    name: 'Factor IX 감소',
    description:
      '상류 전구 노드가 낮은 공급값에서 시작한다. 나머지는 그대로다.',
    focus:
      '상류 노드가 제약될 때 하류 신호의 형태가 어떻게 달라지는지 관찰한다.',
    supplyOverrides: { factorIX: 0.15 },
  },
  {
    id: 'increased-factor-ix',
    name: 'Factor IX 증가',
    description:
      '상류 전구 노드가 높은 공급값에서 시작한다. 나머지는 그대로다.',
    focus:
      '하류 곡선의 시점을 균형 잡힌 기준과 비교해 본다.',
    supplyOverrides: { factorIX: 0.95 },
  },
  {
    id: 'increased-tfpi-inhibition',
    name: 'TFPI 억제 증가',
    description:
      '첫 번째 억제 노드가 높게 시작해, 네트워크 중간부의 활성형 노드를 만들어 내는 엣지를 약화시킨다.',
    focus:
      'Factor Xa 모델 신호가 눌려 있는 동안 억제 모델 신호가 올라가는 모습을 관찰한다.',
    supplyOverrides: { tfpi: 0.85 },
  },
  {
    id: 'reduced-antithrombin-activity',
    name: 'Antithrombin 활성 감소',
    description:
      '두 번째 억제 노드가 낮게 시작해, 중심 출력 노드가 덜 제거된다.',
    focus:
      'Thrombin 모델 신호와 Fibrin 모델 신호를 균형 잡힌 기준과 견주어 본다.',
    supplyOverrides: { antithrombin: 0.1 },
  },
  {
    id: 'combined-abstract-modifiers',
    name: '복합 추상 조정',
    description:
      '여러 노드를 한꺼번에 옮긴다. 상류 전구 노드는 낮추고, 첫 번째 억제 노드는 높이고, 두 번째 억제 노드는 낮춘다.',
    focus:
      '조정 요인들이 서로 겨루는 예시로, 곡선을 눈으로 가늠하기가 더 어렵다.',
    supplyOverrides: { factorIX: 0.3, tfpi: 0.7, antithrombin: 0.2 },
    vesselDamageSignal: 0.7,
  },
  {
    id: 'custom-sandbox',
    name: '사용자 샌드박스',
    description:
      '모든 노드를 척도 중간에 둔 중립적인 출발점으로, 자유롭게 탐색하라고 마련한 것이다.',
    focus:
      '아무 슬라이더나 움직여 그래프가 어떻게 반응하는지 살펴본다. 초기화하면 이 출발점으로 돌아온다.',
    supplyOverrides: {
      factorIX: 0.5,
      factorVIIIa: 0.5,
      factorX: 0.5,
      prothrombin: 0.5,
      fibrinogen: 0.5,
      tfpi: 0.5,
      antithrombin: 0.5,
      platelets: 0.5,
    },
    vesselDamageSignal: 0.5,
  },
] as const;

export const DEFAULT_PRESET_ID: PresetId = 'balanced-network';

const PRESET_MAP: ReadonlyMap<PresetId, ScenarioPreset> = new Map(
  SCENARIO_PRESETS.map((preset) => [preset.id, preset] as const),
);

export function getPreset(id: PresetId): ScenarioPreset {
  const preset = PRESET_MAP.get(id);
  if (!preset) {
    throw new RangeError(`알 수 없는 프리셋 id: ${String(id)}`);
  }
  return preset;
}

export function isPresetId(value: unknown): value is PresetId {
  return typeof value === 'string' && PRESET_MAP.has(value as PresetId);
}

/**
 * 프리셋에 대응하는 완전하고 검증된 설정을 만든다.
 *
 * 항상 기본값에서 새로 유도하므로 같은 프리셋을 두 번 적용해도 동일한 설정이
 * 나오고, 어떤 프리셋도 다른 프리셋을 변경할 수 없다.
 */
export function buildPresetConfig(id: PresetId): SimulationConfig {
  const preset = getPreset(id);
  const base = createDefaultConfig();

  const supply = { ...base.supply };
  for (const [entityId, value] of Object.entries(preset.supplyOverrides)) {
    if (typeof value === 'number') {
      supply[entityId as EntityId] = value;
    }
  }

  return normalizeConfig({
    ...base,
    supply,
    vesselDamageSignal: preset.vesselDamageSignal ?? base.vesselDamageSignal,
  });
}
