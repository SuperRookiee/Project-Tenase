/**
 * 정규화 숫자 헬퍼.
 *
 * 이 프로젝트의 모든 사용자 노출 파라미터는 0.0–1.0 척도의 무차원 값이므로,
 * 이 헬퍼들이 잘못된 입력을 모델 바깥에서 막아 주는 경계다. 그런 이유로 여기서는
 * 빠짐없이 검사한다.
 */
import { describe, expect, it } from 'vitest';
import {
  NORMALIZED_MAX,
  NORMALIZED_MIN,
  assertNormalized,
  clamp01,
  formatNormalized,
  formatPercentOfScale,
  isNormalized,
  lerp,
  parseNormalized,
} from '@/simulation/numeric';

describe('parseNormalized', () => {
  it('척도 안에 이미 들어 있는 유한수를 받아들인다', () => {
    expect(parseNormalized(0)).toBe(0);
    expect(parseNormalized(1)).toBe(1);
    expect(parseNormalized(0.42)).toBe(0.42);
    expect(parseNormalized(0.000001)).toBe(0.000001);
  });

  it('지수 표기와 부호 표기를 포함한 숫자 문자열을 받아들인다', () => {
    expect(parseNormalized('0')).toBe(0);
    expect(parseNormalized('1')).toBe(1);
    expect(parseNormalized('0.42')).toBe(0.42);
    expect(parseNormalized('  0.75  ')).toBe(0.75);
    expect(parseNormalized('1e-3')).toBe(0.001);
    expect(parseNormalized('+0.5')).toBe(0.5);
  });

  it('범위를 벗어난 유한 입력을 거부하지 않고 범위 제한한다', () => {
    expect(parseNormalized(1.5)).toBe(NORMALIZED_MAX);
    expect(parseNormalized(-0.5)).toBe(NORMALIZED_MIN);
    expect(parseNormalized(1e9)).toBe(NORMALIZED_MAX);
    expect(parseNormalized(-1e9)).toBe(NORMALIZED_MIN);
    expect(parseNormalized('2')).toBe(NORMALIZED_MAX);
    expect(parseNormalized('-2')).toBe(NORMALIZED_MIN);
  });

  it.each<[string, unknown]>([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['빈 문자열', ''],
    ['공백만 있는 문자열', '   '],
    ["'abc'", 'abc'],
    ['null', null],
    ['undefined', undefined],
    ['true', true],
    ['false', false],
    ['{}', {}],
    ['[]', []],
    ['[0.5]', [0.5]],
    ['함수', () => 0.5],
    ['심볼', Symbol('0.5')],
  ])('%s에 대해 null을 반환한다', (_label, input) => {
    expect(parseNormalized(input)).toBeNull();
  });
});

describe('clamp01', () => {
  it('척도 안에 이미 들어 있는 값은 그대로 통과시킨다', () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(0.333)).toBe(0.333);
  });

  it('척도를 벗어난 유한값을 경계로 범위 제한한다', () => {
    expect(clamp01(-0.0001)).toBe(NORMALIZED_MIN);
    expect(clamp01(-250)).toBe(NORMALIZED_MIN);
    expect(clamp01(1.0001)).toBe(NORMALIZED_MAX);
    expect(clamp01(250)).toBe(NORMALIZED_MAX);
  });

  it.each<[string, number]>([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('%s를 조용히 변환하지 않고 RangeError를 던진다', (_label, input) => {
    expect(() => clamp01(input)).toThrow(RangeError);
  });

  it('런타임에 숫자가 아닌 값을 받으면 RangeError를 던진다', () => {
    // 시그니처는 `number`지만, 타입 없이 호출하는 쪽을 위해 가드를 둔다.
    expect(() => clamp01(undefined as unknown as number)).toThrow(RangeError);
    expect(() => clamp01('0.5' as unknown as number)).toThrow(RangeError);
    expect(() => clamp01(null as unknown as number)).toThrow(RangeError);
  });
});

describe('assertNormalized', () => {
  it('사용 가능한 입력에 대해 파싱한 값을 반환한다', () => {
    expect(assertNormalized(0.25, 'supply.factorIX')).toBe(0.25);
    expect(assertNormalized('0.25', 'supply.factorIX')).toBe(0.25);
  });

  it('범위를 벗어난 유한 입력을 예외 없이 범위 제한한다', () => {
    expect(assertNormalized(4, 'particleDensity')).toBe(NORMALIZED_MAX);
    expect(assertNormalized(-4, 'particleDensity')).toBe(NORMALIZED_MIN);
  });

  it.each<[string, unknown]>([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ["'abc'", 'abc'],
    ['null', null],
    ['undefined', undefined],
    ['{}', {}],
  ])('%s에 대해 RangeError를 던진다', (_label, input) => {
    expect(() => assertNormalized(input, 'vesselDamageSignal')).toThrow(RangeError);
  });

  it('던진 메시지에 문제가 된 라벨 이름을 담는다', () => {
    expect(() => assertNormalized(Number.NaN, 'supply.thrombin')).toThrow(
      /supply\.thrombin/,
    );
    expect(() => assertNormalized('abc', 'simulationSpeed')).toThrow(
      /simulationSpeed/,
    );
  });
});

describe('isNormalized', () => {
  it('하한과 상한에서는 정확히 true다', () => {
    expect(isNormalized(NORMALIZED_MIN)).toBe(true);
    expect(isNormalized(NORMALIZED_MAX)).toBe(true);
    expect(isNormalized(0)).toBe(true);
    expect(isNormalized(1)).toBe(true);
    expect(isNormalized(-0)).toBe(true);
  });

  it('경계를 조금이라도 벗어나면 false다', () => {
    expect(isNormalized(-Number.EPSILON)).toBe(false);
    expect(isNormalized(1 + Number.EPSILON)).toBe(false);
    expect(isNormalized(-0.0001)).toBe(false);
    expect(isNormalized(1.0001)).toBe(false);
  });

  it('유한수가 아닌 값은 모두 false다', () => {
    expect(isNormalized(Number.NaN)).toBe(false);
    expect(isNormalized(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isNormalized(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(isNormalized('0.5')).toBe(false);
    expect(isNormalized(true)).toBe(false);
    expect(isNormalized(null)).toBe(false);
    expect(isNormalized(undefined)).toBe(false);
    expect(isNormalized({})).toBe(false);
  });
});

describe('표시 헬퍼', () => {
  it('두 무차원 값 사이를 보간한다', () => {
    expect(lerp(0, 1, 0)).toBe(0);
    expect(lerp(0, 1, 1)).toBe(1);
    expect(lerp(0, 1, 0.5)).toBe(0.5);
    expect(lerp(0.2, 0.6, 0.5)).toBeCloseTo(0.4, 12);
  });

  it('측정 정밀도를 암시하지 않는 형태로 정규화 값을 표기한다', () => {
    expect(formatNormalized(0.123456)).toBe('0.123');
    expect(formatNormalized(0.123456, 1)).toBe('0.1');
    expect(formatNormalized(Number.NaN)).toBe('—');
  });

  it('단위가 아니라 전체 척도 대비 비율로 표기한다', () => {
    expect(formatPercentOfScale(0.63)).toBe('전체 척도의 63%');
    expect(formatPercentOfScale(0)).toBe('전체 척도의 0%');
    expect(formatPercentOfScale(1)).toBe('전체 척도의 100%');
    expect(formatPercentOfScale(Number.NaN)).toBe('—');
  });
});
