/**
 * 시나리오 프리셋.
 *
 * 프리셋은 선별된 시작 설정을 적어 두는 유일한 자리이므로, 유효성, 순수성,
 * 완전성, 그리고 이 프로젝트가 요구하는 중립적이고 진료와 무관한 어휘를 지키는지
 * 검사한다.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESET_ID,
  SCENARIO_PRESETS,
  buildPresetConfig,
  getPreset,
  isPresetId,
  type PresetId,
} from '@/presets/scenarios';
import { ENTITY_IDS } from '@/simulation/entities';
import { isNormalized } from '@/simulation/numeric';

/**
 * `PresetId` 유니온 전체를 키로 갖는 `Record`. 프리셋 레지스트리를 갱신하지 않고
 * 유니온에 id를 추가하거나 제거하면 컴파일러가 이 객체를 거부하므로, 완전성
 * 검사가 조용히 낡아 갈 수 없다.
 */
const EVERY_PRESET_ID: Record<PresetId, true> = {
  'balanced-network': true,
  'reduced-factor-ix': true,
  'increased-factor-ix': true,
  'increased-tfpi-inhibition': true,
  'reduced-antithrombin-activity': true,
  'combined-abstract-modifiers': true,
  'custom-sandbox': true,
};

const ALL_PRESET_IDS = Object.keys(EVERY_PRESET_ID) as PresetId[];

/**
 * 사용자에게 보이는 프리셋 문구에 나타나서는 안 되는 어휘. `policy.test.ts`가
 * 저장소 전체에 강제하는 목록을 그대로 옮긴 것이다.
 */
const BANNED_PATTERNS: readonly RegExp[] = [
  /\bsuccess(?:es|ful|fully)?\b/i,
  /\bfailures?\b/i,
  /\bsafe(?:ly|ty|r|st)?\b/i,
  /\bunsafe(?:ly)?\b/i,
  /\brisk(?:s|y|ier|iest)?\b/i,
  /\btherapeutics?\b/i,
  /\bdos(?:e|es|ed|ing)\b/i,
  /\bdosages?\b/i,
  /\bpatients?\b/i,
  /\bclinical(?:ly)?\b/i,
  /\bdiagnos\w*/i,
  /\btreats?\b/i,
  /\btherap(?:y|ies)\b/i,
  /\bdiseases?\b/i,
  /\bbleeding\b/i,
  /\bthrombos(?:is|es)\b/i,
  /\bhemophilia\w*/i,
  /\banticoagul\w*/i,
  /\bmg\b/i,
  /\bIU\b/i,
];

describe('프리셋 레지스트리', () => {
  it('PresetId 유니온의 모든 id마다 항목이 정확히 하나씩 있다', () => {
    const registryIds = SCENARIO_PRESETS.map((preset) => preset.id);
    expect([...registryIds].sort()).toEqual([...ALL_PRESET_IDS].sort());
    expect(new Set(registryIds).size).toBe(registryIds.length);
  });

  it('레지스트리에 실제로 있는 기본 id를 노출한다', () => {
    expect(isPresetId(DEFAULT_PRESET_ID)).toBe(true);
    expect(getPreset(DEFAULT_PRESET_ID).id).toBe(DEFAULT_PRESET_ID);
  });

  it('모든 프리셋에 비어 있지 않은 표시 문구를 준다', () => {
    for (const preset of SCENARIO_PRESETS) {
      expect(preset.name.trim().length, `${preset.id} 이름`).toBeGreaterThan(0);
      expect(
        preset.description.trim().length,
        `${preset.id} 설명`,
      ).toBeGreaterThan(0);
      expect(preset.focus.trim().length, `${preset.id} 초점`).toBeGreaterThan(0);
    }
  });

  it('실제 엔티티 id만 정규화 값으로 덮어쓴다', () => {
    for (const preset of SCENARIO_PRESETS) {
      for (const [entityId, value] of Object.entries(preset.supplyOverrides)) {
        expect(
          ENTITY_IDS,
          `${preset.id}이(가) 알 수 없는 엔티티 "${entityId}"를 덮어쓴다`,
        ).toContain(entityId);
        expect(
          isNormalized(value),
          `${preset.id}.supplyOverrides.${entityId} = ${String(value)}이(가) 0–1 밖이다`,
        ).toBe(true);
      }
      if (preset.vesselDamageSignal !== undefined) {
        expect(
          isNormalized(preset.vesselDamageSignal),
          `${preset.id}.vesselDamageSignal이 0–1 밖이다`,
        ).toBe(true);
      }
    }
  });

  it('알 수 없는 id에 대해서는 예외를 던진다', () => {
    expect(() => getPreset('nope' as PresetId)).toThrow(RangeError);
  });
});

describe('buildPresetConfig', () => {
  it.each(ALL_PRESET_IDS)(
    '%s에 대해 완전히 정규화된 설정을 만든다',
    (id) => {
      const config = buildPresetConfig(id);

      for (const entityId of ENTITY_IDS) {
        expect(
          isNormalized(config.supply[entityId]),
          `${id}: supply.${entityId} = ${String(config.supply[entityId])}`,
        ).toBe(true);
        expect(
          typeof config.enabled[entityId],
          `${id}: enabled.${entityId}은(는) 불리언이어야 한다`,
        ).toBe('boolean');
      }

      expect(Object.keys(config.supply).sort()).toEqual([...ENTITY_IDS].sort());
      expect(Object.keys(config.enabled).sort()).toEqual([...ENTITY_IDS].sort());

      expect(isNormalized(config.vesselDamageSignal), `${id}: 손상`).toBe(true);
      expect(isNormalized(config.simulationSpeed), `${id}: 속도`).toBe(true);
      expect(isNormalized(config.particleDensity), `${id}: 밀도`).toBe(true);
    },
  );

  it('각 프리셋이 선언한 덮어쓰기를 적용한다', () => {
    for (const preset of SCENARIO_PRESETS) {
      const config = buildPresetConfig(preset.id);
      for (const [entityId, value] of Object.entries(preset.supplyOverrides)) {
        expect(
          config.supply[entityId as keyof typeof config.supply],
          `${preset.id}: supply.${entityId}`,
        ).toBe(value);
      }
      if (preset.vesselDamageSignal !== undefined) {
        expect(config.vesselDamageSignal).toBe(preset.vesselDamageSignal);
      }
    }
  });

  it('순수하다: 두 번 호출하면 값은 같지만 같은 객체는 아니다', () => {
    for (const id of ALL_PRESET_IDS) {
      const first = buildPresetConfig(id);
      const second = buildPresetConfig(id);
      expect(second).toEqual(first);
      expect(second).not.toBe(first);
      expect(second.supply).not.toBe(first.supply);
      expect(second.enabled).not.toBe(first.enabled);
    }
  });

  it('앞서 반환한 설정을 변형해도 영향을 받지 않는다', () => {
    const baseline = buildPresetConfig('balanced-network');
    const snapshot = structuredClone(baseline);

    // 설정에서 변형 가능한 표면은 `supply`와 `enabled`뿐이고, 프리셋이 실수로
    // 공유할 수 있는 것도 정확히 이 둘이다.
    const mutable = buildPresetConfig('balanced-network');
    mutable.supply.factorIX = 0.01;
    mutable.enabled.thrombin = false;

    expect(buildPresetConfig('balanced-network')).toEqual(snapshot);
    expect(baseline).toEqual(snapshot);
  });

  it('프리셋이 다르면 다른 설정을 만든다', () => {
    const balanced = buildPresetConfig('balanced-network');
    const reduced = buildPresetConfig('reduced-factor-ix');
    const increased = buildPresetConfig('increased-factor-ix');

    expect(reduced.supply.factorIX).toBeLessThan(balanced.supply.factorIX);
    expect(increased.supply.factorIX).toBeGreaterThan(balanced.supply.factorIX);
  });
});

describe('isPresetId', () => {
  it('등록된 모든 id를 받아들인다', () => {
    for (const id of ALL_PRESET_IDS) {
      expect(isPresetId(id)).toBe(true);
    }
  });

  it.each<[string, unknown]>([
    ['알 수 없는 문자열', 'balanced'],
    ['빈 문자열', ''],
    ['null', null],
    ['undefined', undefined],
    ['숫자', 42],
    ['true', true],
    ['{}', {}],
    ['[]', []],
    ['비슷하게 생긴 객체', { id: 'balanced-network' }],
  ])('%s를 거부한다', (_label, value) => {
    expect(isPresetId(value)).toBe(false);
  });
});

describe('프리셋 어휘', () => {
  it('모든 프리셋 문자열에 금칙 어휘가 없도록 유지한다', () => {
    const violations: string[] = [];

    for (const preset of SCENARIO_PRESETS) {
      const fields: ReadonlyArray<readonly [string, string]> = [
        ['id', preset.id],
        ['name', preset.name],
        ['description', preset.description],
        ['focus', preset.focus],
      ];
      for (const [field, text] of fields) {
        for (const pattern of BANNED_PATTERNS) {
          const match = pattern.exec(text);
          if (match) {
            violations.push(`${preset.id}.${field}: "${text}" 안의 "${match[0]}"`);
          }
        }
      }
    }

    expect(
      violations,
      `프리셋 문구에서 발견된 금칙 어휘:\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});
