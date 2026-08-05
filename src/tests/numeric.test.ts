/**
 * 정규화 숫자 헬퍼.
 *
 * 이 프로젝트의 모든 사용자 노출 파라미터는 0.0–1.0 척도의 무차원 값이므로,
 * 이 헬퍼들이 잘못된 입력을 모델 바깥에서 막아 주는 경계다. 그런 이유로 여기서는
 * 빠짐없이 검사한다.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISPLAY_SCALE,
  NORMALIZED_MAX,
  NORMALIZED_MIN,
  assertNormalized,
  clamp01,
  formatNormalized,
  formatPercentOfScale,
  formatScaled,
  formatScaledValueText,
  isDisplayScale,
  isNormalized,
  lerp,
  parseNormalized,
  parseScaled,
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

describe('눈금 기준', () => {
  it('1 이상의 정수만 기준으로 받아들인다', () => {
    for (const value of [1, 100, DEFAULT_DISPLAY_SCALE, 1_000_000]) {
      expect(isDisplayScale(value)).toBe(true);
    }
    for (const value of [0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, 1_000_001, '3000', null]) {
      expect(isDisplayScale(value)).toBe(false);
    }
  });
});

describe('parseScaled', () => {
  const SCALE = DEFAULT_DISPLAY_SCALE;

  it('눈금 위의 정수를 0–1 값으로 되돌린다', () => {
    expect(parseScaled('450', SCALE)).toBe(0.15);
    expect(parseScaled(2100, SCALE)).toBe(0.7);
    expect(parseScaled('1500', SCALE)).toBe(0.5);
  });

  it('양 끝을 정확히 맞춘다', () => {
    expect(parseScaled('0', SCALE)).toBe(NORMALIZED_MIN);
    expect(parseScaled(SCALE, SCALE)).toBe(NORMALIZED_MAX);
    // 나눗셈을 거치지 않으므로 위쪽 끝이 0.9999...가 되는 일이 없다.
    expect(parseScaled(String(SCALE), SCALE)).toBe(1);
  });

  it('범위를 벗어난 값은 잘라 내되 정규화 경로로 새지 않는다', () => {
    // parseNormalized였다면 '450'을 조용히 1로 만들었을 것이다. 여기서는 눈금 위의
    // 숫자로 읽으므로 0.15가 나와야 한다.
    expect(parseNormalized('450')).toBe(1);
    expect(parseScaled('450', SCALE)).toBe(0.15);
    expect(parseScaled('9999', SCALE)).toBe(1);
    expect(parseScaled('-5', SCALE)).toBe(0);
  });

  it('음수 쪽 경계에서 -0을 만들지 않는다', () => {
    // -0이 저장되면 Object.is 비교가 값이 바뀐 것으로 읽어 무거운 재계산을 부른다.
    const parsed = parseScaled('-0.4', SCALE);
    expect(parsed).toBe(0);
    expect(Object.is(parsed, -0)).toBe(false);
  });

  it('소수 입력은 버리지 않고 반올림한다', () => {
    expect(parseScaled('450.4', SCALE)).toBe(0.15);
    expect(parseScaled('449.6', SCALE)).toBe(0.15);
    expect(parseScaled('1.5e3', SCALE)).toBe(0.5);
  });

  it('쓸 수 없는 입력은 거부한다', () => {
    for (const input of ['', '   ', 'abc', 'NaN', 'Infinity', true, null, undefined, {}, []]) {
      expect(parseScaled(input, SCALE), `${JSON.stringify(input)}은 거부돼야 한다`).toBeNull();
    }
  });

  it('기준 자체가 쓸 수 없으면 거부한다', () => {
    expect(parseScaled('450', 0)).toBeNull();
    expect(parseScaled('450', 2.5)).toBeNull();
    expect(parseScaled('450', Number.NaN)).toBeNull();
  });
});

describe('formatScaled', () => {
  it('0–1 값을 눈금 위의 정수로 적는다', () => {
    expect(formatScaled(0.15, DEFAULT_DISPLAY_SCALE)).toBe('450');
    expect(formatScaled(0, DEFAULT_DISPLAY_SCALE)).toBe('0');
    expect(formatScaled(1, DEFAULT_DISPLAY_SCALE)).toBe('3000');
  });

  it('유한하지 않은 값에 예외를 던지지 않고 자리표시자를 낸다', () => {
    // clamp01은 이런 값에 예외를 던지므로 순서가 뒤집히면 렌더 도중 터진다.
    expect(formatScaled(Number.NaN, DEFAULT_DISPLAY_SCALE)).toBe('—');
    expect(formatScaled(Number.POSITIVE_INFINITY, DEFAULT_DISPLAY_SCALE)).toBe('—');
  });

  it('범위를 벗어난 값을 잘라 낸다', () => {
    expect(formatScaled(450, DEFAULT_DISPLAY_SCALE)).toBe('3000');
    expect(formatScaled(-1, DEFAULT_DISPLAY_SCALE)).toBe('0');
  });
});

describe('눈금 왕복', () => {
  it('기준 위의 모든 정수가 그대로 되돌아온다', () => {
    // Math.floor나 parseInt였다면 여기서 어긋난다. 기준이 3000일 때 0.009 * 3000이
    // 26.999999999999996이라 27이 26으로 내려앉기 때문이다.
    const scale = DEFAULT_DISPLAY_SCALE;
    for (let steps = 0; steps <= scale; steps += 1) {
      const parsed = parseScaled(String(steps), scale);
      expect(parsed).not.toBeNull();
      expect(formatScaled(parsed as number, scale)).toBe(String(steps));
    }
  });

  it('다른 기준에서도 어긋나지 않는다', () => {
    for (const scale of [1, 10, 100, 256, 1000, 4096, 9999]) {
      for (let steps = 0; steps <= scale; steps += 1) {
        const parsed = parseScaled(steps, scale);
        expect(formatScaled(parsed as number, scale), `기준 ${scale}의 ${steps}`).toBe(
          String(steps),
        );
      }
    }
  });
});

describe('formatScaledValueText', () => {
  it('눈에 보이는 정수와 전체 척도 대비 비율을 함께 읽어 준다', () => {
    const text = formatScaledValueText(0.15, DEFAULT_DISPLAY_SCALE);
    expect(text).toContain('450');
    expect(text).toContain('3000');
    expect(text).toContain('15%');
  });

  it('유한하지 않은 값에 자리표시자를 낸다', () => {
    expect(formatScaledValueText(Number.NaN, DEFAULT_DISPLAY_SCALE)).toBe('—');
  });
});
