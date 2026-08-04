'use client';

/**
 * 값이 잠잠해질 때까지 갱신을 미룬다.
 *
 * 슬라이더를 끄는 동안 무거운 파생 계산이 매 입력마다 도는 것을 막는 데 쓴다. 가벼운
 * 표시값은 원본을 그대로 쓰고 비싼 계산만 이 값에 매달아 두면, 조작 중에는 직전 결과가
 * 잠깐 남아 있다가 손을 멈추는 즉시 따라잡는다.
 *
 * 타이머 하나만 쓰며 저장소도 네트워크도 건드리지 않는다.
 */
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    if (Object.is(settled, value)) return;
    const handle = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(handle);
    // `settled`는 의도적으로 뺀다. 확정 직후 이 effect가 다시 돌 이유가 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs]);

  return settled;
}
