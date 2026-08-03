/**
 * 애니메이션 프레임 스케줄러.
 *
 * 브라우저 없이 테스트에서 시계 전체를 동기적으로 구동할 수 있도록, 의도적으로
 * 프레임워크에 의존하지 않고 의존성을 주입받게 만들었다. 스케줄러는 엔진이
 * *언제* 진행하는지를 소유하고, 엔진은 *얼마나 멀리* 진행하는지를 소유한다.
 */

export type FrameCallback = (deltaSeconds: number) => void;

export interface SchedulerDeps {
  requestFrame: (callback: (timestamp: number) => void) => number;
  cancelFrame: (handle: number) => void;
  now: () => number;
}

export interface Scheduler {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  /** 명시적인 델타로 한 프레임만 실행한다. 한 스텝 전진과 테스트에 쓴다. */
  pump(deltaSeconds: number): void;
}

/** 콜백으로 전달하는 최대 델타. 탭 복귀 상황을 막아 준다. */
export const MAX_SCHEDULER_DELTA_SECONDS = 0.25;

function defaultDeps(): SchedulerDeps {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return {
      requestFrame: (callback) => globalThis.requestAnimationFrame(callback),
      cancelFrame: (handle) => globalThis.cancelAnimationFrame(handle),
      now: () => globalThis.performance.now(),
    };
  }
  // 헤드리스 대체 구현. 덕분에 브라우저 밖에서 이 모듈을 불러와도 예외가 없다.
  return {
    requestFrame: (callback) =>
      setTimeout(() => callback(Date.now()), 16) as unknown as number,
    cancelFrame: (handle) => clearTimeout(handle),
    now: () => Date.now(),
  };
}

export function createScheduler(
  onFrame: FrameCallback,
  deps: SchedulerDeps = defaultDeps(),
): Scheduler {
  let handle: number | null = null;
  let lastTimestamp: number | null = null;

  const loop = (timestamp: number): void => {
    const previous = lastTimestamp ?? timestamp;
    lastTimestamp = timestamp;

    // 타임스탬프는 밀리초 단위로 들어오고, 엔진은 초 단위로 동작한다.
    const delta = Math.min(
      Math.max((timestamp - previous) / 1000, 0),
      MAX_SCHEDULER_DELTA_SECONDS,
    );
    onFrame(delta);

    if (handle !== null) {
      handle = deps.requestFrame(loop);
    }
  };

  return {
    start(): void {
      if (handle !== null) return;
      lastTimestamp = deps.now();
      handle = deps.requestFrame(loop);
    },
    stop(): void {
      if (handle === null) return;
      deps.cancelFrame(handle);
      handle = null;
      lastTimestamp = null;
    },
    isRunning(): boolean {
      return handle !== null;
    },
    pump(deltaSeconds: number): void {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      onFrame(Math.min(deltaSeconds, MAX_SCHEDULER_DELTA_SECONDS));
    },
  };
}
