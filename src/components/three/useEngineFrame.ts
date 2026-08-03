'use client';
/**
 * 렌더 루프와 엔진 사이를 잇는 읽기 전용 다리.
 *
 * 엔진을 진행시키는 것은 (캔버스 바깥의) 애플리케이션 클록뿐이다. 이 훅은 `advance`나
 * `step`을 절대 호출하지 않는다. 애니메이션 프레임마다 엔진의 실시간 상태를 한 번 읽어
 * 호출자에게 건넬 뿐이다.
 *
 * React 상태를 끌어들이지 않은 것은 의도된 선택이다. 60 Hz로 읽는 구독자를 스토어에
 * 붙이면 나머지 UI가 기대는 조절된 발행 주기가 무의미해진다. 변경 가능한 컨텍스트 객체
 * 하나를 프레임 사이에 재사용하므로 루프는 프레임마다 할당을 하지 않는다.
 */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { getEngine, simulationStore } from '@/store/simulationStore';
import type {
  DerivedSignals,
  EntityId,
  EntityLevels,
  SimulationConfig,
} from '@/simulation/types';

export interface EngineFrameContext {
  /** 실시간 수준 레코드. 엔진이 제자리에서 변경하므로 — 절대 보관하지 말 것. */
  levels: EntityLevels;
  signals: DerivedSignals;
  reactionActivity: Readonly<Record<string, number>>;
  config: SimulationConfig;
  selectedEntityId: EntityId | null;
  hoveredEntityId: EntityId | null;
  /** 앱 내 토글과 OS 설정 중 하나라도 요청하면 true. */
  reducedMotion: boolean;
  /** 직전 프레임 이후 흐른 시간(초). 범위 제한이 적용된 값이다. */
  delta: number;
  /** 애니메이션 위상 시간(초). 모션 줄이기가 켜져 있는 동안에는 멈춰 있다. */
  elapsed: number;
}

/** 긴 프레임(백그라운드로 밀린 탭)이 장면을 건너뛰게 만들어서는 안 된다. */
const MAX_VISUAL_DELTA_SECONDS = 0.1;

/**
 * 모듈 스코프에 하나만 두는 미디어 쿼리. 클라이언트에서 지연 생성해 페이지가 살아 있는
 * 동안 유지한다. 일치 결과를 캐시해 두므로 프레임마다 읽는 비용이 들지 않는다.
 */
let reducedMotionQuery: MediaQueryList | null = null;
let reducedMotionMatches = false;

function ensureReducedMotionQuery(): void {
  if (reducedMotionQuery !== null) return;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return;
  }
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotionMatches = reducedMotionQuery.matches;
  reducedMotionQuery.addEventListener('change', (event: MediaQueryListEvent) => {
    reducedMotionMatches = event.matches;
  });
}

/**
 * 렌더된 프레임마다 엔진의 실시간 뷰를 담아 `callback`을 한 번 실행한다.
 *
 * 컨텍스트는 읽기 전용이며 호출자가 붙들고 있어서는 안 된다. 매 프레임 같은 객체에
 * 필드만 갱신해 다시 건네주기 때문이다.
 */
export function useEngineFrame(callback: (ctx: EngineFrameContext) => void): void {
  const contextRef = useRef<EngineFrameContext | null>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    ensureReducedMotionQuery();
  }, []);

  useFrame((_state, rawDelta) => {
    const engineState = getEngine().getState();
    const storeState = simulationStore.getState();
    const snapshot =
      storeState.scrubIndex === null
        ? undefined
        : storeState.frame.snapshots[storeState.scrubIndex];
    const levels = snapshot?.levels ?? engineState.levels;
    const signals = snapshot?.signals ?? engineState.signals;
    const reactionActivity = snapshot?.reactionActivity ?? engineState.reactionActivity;

    const reducedMotion = storeState.reducedMotion || reducedMotionMatches;
    const delta = Number.isFinite(rawDelta)
      ? Math.min(Math.max(rawDelta, 0), MAX_VISUAL_DELTA_SECONDS)
      : 0;

    // 콜백 전체가 아니라 위상 클록만 멈추면, 드리프트와 맥동은 모두 정지한 자세를
    // 유지하면서도 수준 변화는 계속 눈에 보인다.
    if (!reducedMotion) {
      elapsedRef.current += delta;
    }

    let context = contextRef.current;
    if (context === null) {
      context = {
        levels,
        signals,
        reactionActivity,
        config: storeState.config,
        selectedEntityId: storeState.selectedEntityId,
        hoveredEntityId: storeState.hoveredEntityId,
        reducedMotion,
        delta,
        elapsed: elapsedRef.current,
      };
      contextRef.current = context;
    } else {
      context.levels = levels;
      context.signals = signals;
      context.reactionActivity = reactionActivity;
      context.config = storeState.config;
      context.selectedEntityId = storeState.selectedEntityId;
      context.hoveredEntityId = storeState.hoveredEntityId;
      context.reducedMotion = reducedMotion;
      context.delta = delta;
      context.elapsed = elapsedRef.current;
    }

    callback(context);
  });
}
