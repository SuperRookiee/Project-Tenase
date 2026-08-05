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

/**
 * 눈금 기준의 기본값.
 *
 * 0–1 소수를 직접 타이핑하는 대신 정수로 읽고 쓰기 위한 표시용 기준일 뿐이다. 저장되는
 * 값은 언제나 0–1 무차원 값이고, 이 숫자가 무엇의 몇 분의 몇인지는 이 모형이 아는 바가
 * 아니다. 단위 이름을 붙이지 않는 이유가 그것이다.
 */
export const DEFAULT_DISPLAY_SCALE = 3000;

/** 눈금 기준으로 쓸 수 있는 값인지. 정수여야 표시값이 정수로 떨어진다. */
export function isDisplayScale(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 1_000_000
  );
}

/**
 * 눈금 기준에 맞춘 정수 표시값을 0–1 값으로 되돌린다.
 *
 * `parseNormalized`를 대신 쓰면 안 된다. 그쪽은 1을 넘는 값을 조용히 1로 잘라 내므로
 * `parseNormalized('450')`이 아무 소리 없이 1이 된다. 눈금 위의 숫자는 정규화 값이
 * 아니므로 들어오는 길목이 따로 있어야 한다.
 *
 * 반올림은 반드시 `Math.round`다. `Math.floor`나 `parseInt`는 어긋난다 — 기준이
 * 3000일 때 0.009 * 3000이 26.999999999999996이라 27이 26으로 내려앉는다.
 *
 * 규약은 `parseNormalized`와 같다. 쓸 수 없는 입력에는 `null`을 돌려주고 호출자가
 * 조용히 무시한다. 빈 문자열 검사가 특히 중요한데, `Number('')`가 0이라 이 검사가
 * 없으면 필드를 비우는 순간 0이 확정되기 때문이다.
 */
export function parseScaled(input: unknown, scale: number): number | null {
  if (!isDisplayScale(scale)) return null;

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

  const steps = Math.round(candidate);
  // 양 끝은 나누지 않고 상수를 그대로 돌려준다. 경계가 정확해지고, -0이 저장소로
  // 흘러 들어가지 않는다. `Object.is(0, -0)`이 거짓이라 -0은 값이 바뀐 것으로 읽힌다.
  if (steps <= 0) return NORMALIZED_MIN;
  if (steps >= scale) return NORMALIZED_MAX;
  return steps / scale;
}

/**
 * 0–1 값을 눈금 기준에 맞춘 정수 문자열로 적는다.
 *
 * `clamp01`보다 먼저 유한성을 확인한다. `clamp01`은 유한하지 않은 값에 예외를 던지는
 * 유일한 헬퍼라, 순서가 바뀌면 표시가 '—'로 끝나는 대신 렌더 도중 예외가 난다.
 */
export function formatScaled(value: number, scale: number): string {
  if (!Number.isFinite(value) || !isDisplayScale(scale)) return '—';
  return String(Math.round(clamp01(value) * scale));
}

/**
 * 눈금 표시일 때 범위 입력이 보조 기술에 읽어 주는 문구.
 *
 * 눈에 보이는 정수와 전체 척도 대비 비율을 함께 담는다. "전체 척도"라는 말이 기준값과
 * 헷갈릴 수 있으므로 기준을 숫자로 밝혀 적는다.
 */
export function formatScaledValueText(value: number, scale: number): string {
  if (!Number.isFinite(value) || !isDisplayScale(scale)) return '—';
  return `기준 ${scale} 중 ${formatScaled(value, scale)} · ${formatPercentOfScale(value)}`;
}
