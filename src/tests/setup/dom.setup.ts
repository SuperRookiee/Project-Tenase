/**
 * `ui` vitest 프로젝트용 jsdom 설정.
 *
 * jsdom은 UI가 건드리는 브라우저 표면 중 일부만 구현한다. Recharts는
 * `ResizeObserver`로 컨테이너 크기를 재고, 모션 줄이기 훅은 `matchMedia`를 읽고,
 * 목록 위젯은 `scrollIntoView`를 호출한다. 셋 다 jsdom에는 없으므로, 여기서
 * 아무 동작도 하지 않는 대체 구현으로 채워 둔다.
 *
 * 이 파일은 저장소 정책 검사가 건너뛰는 `src/tests/` 아래에 있다.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/** 아무 동작도 하지 않는 옵저버. 콜백을 부르지 않으므로 어떤 테스트도 레이아웃에 의존하지 않는다. */
class ResizeObserverStub implements ResizeObserver {
  constructor(_callback: ResizeObserverCallback) {
    // 이 대체 구현은 콜백을 호출하지 않는다. 테스트는 레이아웃이 아니라 마크업을 단언한다.
  }

  observe(): void {
    // 아무 동작도 하지 않는다
  }

  unobserve(): void {
    // 아무 동작도 하지 않는다
  }

  disconnect(): void {
    // 아무 동작도 하지 않는다
  }
}

/**
 * 언제나 "일치하지 않음"을 보고하는 미디어 쿼리 목록. 최신 표기와 구형 표기를
 * 모두 포함한 리스너 표면을 갖추고 있어서, 컴포넌트가 예외 없이 구독하고 해제할
 * 수 있다.
 */
function createMediaQueryList(query: string): MediaQueryList {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const list = {
    matches: false,
    media: query,
    onchange: null,
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.add(listener);
    },
    removeEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => false,
  };
  return list as unknown as MediaQueryList;
}

if (typeof window !== 'undefined') {
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = ResizeObserverStub;
  }
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = ResizeObserverStub;
  }

  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string) => createMediaQueryList(query);
  }

  // jsdom에는 레이아웃 엔진이 없으므로 이것은 언제나 대체 구현이다.
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    // 아무 동작도 하지 않는다
  };
}

// 모든 DOM 테스트를 앞선 테스트와 독립적으로 유지한다.
afterEach(() => {
  cleanup();
});
