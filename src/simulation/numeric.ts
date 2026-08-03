/**
 * 정규화 숫자 헬퍼.
 *
 * Project Tenase의 모든 사용자 노출 파라미터는 0.0–1.0 척도의 무차원 값이다.
 * 이 헬퍼들이 그 불변식을 강제하는 유일한 지점이므로, 잘못된 입력이 시뮬레이션
 * 상태로 새어 들어가는 일은 생기지 않는다.
 */

export const NORMALIZED_MIN = 0;
export const NORMALIZED_MAX = 1;

/** 이미 정규화 범위 안에 있는 유한한 숫자에 대해서만 참이다. */
export function isNormalized(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= NORMALIZED_MIN &&
    value <= NORMALIZED_MAX
  );
}

/**
 * 유한한 숫자를 0–1 범위로 제한한다.
 *
 * 유한한 숫자가 아닌 값에는 `RangeError`를 던진다. NaN과 무한대는 조용히 강제
 * 변환하지 않고 거부하는데, 이들을 범위 제한해 버리면 상위 단계의 결함을 감추게
 * 되기 때문이다.
 */
export function clamp01(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`유한한 숫자가 필요하지만 다음 값을 받았다: ${String(value)}`);
  }
  if (value < NORMALIZED_MIN) return NORMALIZED_MIN;
  if (value > NORMALIZED_MAX) return NORMALIZED_MAX;
  return value;
}

/**
 * 신뢰할 수 없는 입력(슬라이더 이벤트, 텍스트 필드, 프리셋 페이로드)을 정규화된
 * 숫자로 파싱한다.
 *
 * 범위 안의 유한한 숫자가 아닌 모든 값에 대해 `null`을 반환한다. NaN, 무한대,
 * 불리언, `null`, 객체, 숫자가 아닌 문자열이 모두 여기에 해당한다. 숫자 문자열은
 * 받아들이며, 범위를 벗어난 유한한 숫자는 범위 제한한다. 범위 슬라이더가 자기
 * 경계값을 그대로 보고하는 것은 정상 동작이기 때문이다.
 */
export function parseNormalized(input: unknown): number | null {
  let candidate: number;

  if (typeof input === 'number') {
    candidate = input;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed === '') return null;
    candidate = Number(trimmed);
  } else {
    return null;
  }

  if (!Number.isFinite(candidate)) return null;
  if (candidate < NORMALIZED_MIN) return NORMALIZED_MIN;
  if (candidate > NORMALIZED_MAX) return NORMALIZED_MAX;
  return candidate;
}

/**
 * 값이 쓸 만한 정규화 숫자인지 단언하고, 아니면 예외를 던진다.
 * 조용한 무시가 결함을 가려 버리는 엔진 경계에서 사용한다.
 */
export function assertNormalized(value: unknown, label: string): number {
  const parsed = parseNormalized(value);
  if (parsed === null) {
    throw new RangeError(
      `${label} 값은 0과 1 사이의 유한한 숫자여야 하지만 다음 값을 받았다: ${String(value)}`,
    );
  }
  return parsed;
}

/** 두 무차원 값 사이의 선형 보간. */
export function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

/** 측정 정밀도를 암시하지 않으면서 표시용으로 반올림한다. */
export function formatNormalized(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

/** 정규화 값을 전체 척도에 대한 정수 백분율로 표기한다. */
export function formatPercentOfScale(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `전체 척도의 ${Math.round(clamp01(value) * 100)}%`;
}
