'use client';

/**
 * 애플리케이션 시계.
 *
 * 이 훅이 페이지 전체를 통틀어 단 하나뿐인 실제 시계 루프를 소유한다. 3D 레이어는
 * 엔진을 진행시키지 않고 — 자신의 렌더 루프 안에서 엔진의 실시간 상태를 읽기만
 * 한다 — 따라서 (`AppShell`에서) 이 훅을 한 번 마운트해 두면 WebGL 사용 가능
 * 여부와 상관없이 반응망이 계속 움직인다.
 *
 * 여기서는 아무것도 보존하지 않는다. 스토리지도, 반응망도, 질의 문자열도 없다.
 */
import { useEffect } from 'react';
import { createScheduler } from '@/simulation/scheduler';
import { simulationStore, useSimulationStore } from '@/store/simulationStore';

/** 앱 안의 모션 줄이기 스위치와 짝을 이루는 OS 수준 환경 설정. */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * 최신 리스너 API와 구형 리스너 API 양쪽으로 미디어 쿼리를 구독한다.
 * 언제나 호출할 수 있는 구독 해제 함수를 반환한다.
 */
function subscribeToMediaQuery(
  query: MediaQueryList,
  onChange: (matches: boolean) => void,
): () => void {
  const listener = (event: MediaQueryListEvent): void => {
    onChange(event.matches);
  };

  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', listener);
    return () => {
      query.removeEventListener('change', listener);
    };
  }

  if (typeof query.addListener === 'function') {
    query.addListener(listener);
    return () => {
      query.removeListener(listener);
    };
  }

  return () => {};
}

export function useSimulationClock(): void {
  const reducedMotion = useSimulationStore((state) => state.reducedMotion);

  // --- 프레임 루프 ----------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const scheduler = createScheduler((deltaSeconds) => {
      // 델타를 실제로 소비할지는 스토어가 결정한다. 실행이 멈춰 있거나 타임라인
      // 스크러브가 열려 있으면 `advanceFrame`은 아무 일도 하지 않는다.
      simulationStore.getState().advanceFrame(deltaSeconds);
    });

    const syncToVisibility = (): void => {
      const hidden =
        typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (hidden) {
        scheduler.stop();
      } else {
        scheduler.start();
      }
    };

    syncToVisibility();

    if (typeof document === 'undefined') {
      return () => {
        scheduler.stop();
      };
    }

    document.addEventListener('visibilitychange', syncToVisibility);
    return () => {
      document.removeEventListener('visibilitychange', syncToVisibility);
      scheduler.stop();
    };
  }, []);

  // --- 모션 환경 설정 -------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    simulationStore.getState().setReducedMotion(query.matches);

    return subscribeToMediaQuery(query, (matches) => {
      simulationStore.getState().setReducedMotion(matches);
    });
  }, []);

  // --- 유효 플래그를 <html>에 반영 ------------------------------------------
  useEffect(() => {
    if (typeof document === 'undefined') return;
    // 스타일시트는 html[data-reduced-motion='true']를 기준으로 동작한다.
    document.documentElement.dataset.reducedMotion = reducedMotion ? 'true' : 'false';
  }, [reducedMotion]);
}
