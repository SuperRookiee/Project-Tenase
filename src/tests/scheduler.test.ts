/**
 * 애니메이션 프레임 스케줄러.
 *
 * 스케줄러는 여기서 시계를 동기적으로 구동할 수 있도록 일부러 의존성 주입
 * 방식으로 만들었다. 실제 애니메이션 프레임도, 타이머도, 실제 시각 대기도 없다.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_SCHEDULER_DELTA_SECONDS,
  createScheduler,
  type SchedulerDeps,
} from '@/simulation/scheduler';

interface FakeClock {
  readonly deps: SchedulerDeps;
  readonly requestCount: () => number;
  readonly cancelled: () => readonly number[];
  readonly hasPendingFrame: () => boolean;
  /** 밀리초 단위 절대 타임스탬프로 프레임 하나를 전달한다. */
  readonly deliver: (timestampMs: number) => void;
  readonly setNow: (timestampMs: number) => void;
}

function createFakeClock(startMs = 1000): FakeClock {
  let now = startMs;
  let nextHandle = 1;
  let pending: ((timestamp: number) => void) | null = null;
  let requests = 0;
  const cancelled: number[] = [];

  const deps: SchedulerDeps = {
    requestFrame: (callback) => {
      pending = callback;
      requests += 1;
      nextHandle += 1;
      return nextHandle;
    },
    cancelFrame: (handle) => {
      cancelled.push(handle);
      pending = null;
    },
    now: () => now,
  };

  return {
    deps,
    requestCount: () => requests,
    cancelled: () => cancelled,
    hasPendingFrame: () => pending !== null,
    deliver: (timestampMs) => {
      const callback = pending;
      pending = null;
      now = timestampMs;
      if (!callback) {
        throw new Error('요청된 프레임이 없으므로 전달할 프레임도 없다.');
      }
      callback(timestampMs);
    },
    setNow: (timestampMs) => {
      now = timestampMs;
    },
  };
}

describe('시작과 정지', () => {
  it('실행 상태를 보고한다', () => {
    const clock = createFakeClock();
    const scheduler = createScheduler(() => {}, clock.deps);

    expect(scheduler.isRunning()).toBe(false);
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('멱등하다: 두 번째 start는 프레임을 다시 요청하지 않는다', () => {
    const clock = createFakeClock();
    const scheduler = createScheduler(() => {}, clock.deps);

    scheduler.start();
    scheduler.start();
    scheduler.start();

    expect(clock.requestCount()).toBe(1);
    expect(scheduler.isRunning()).toBe(true);
  });

  it('정지할 때 대기 중인 프레임을 취소한다', () => {
    const clock = createFakeClock();
    const scheduler = createScheduler(() => {}, clock.deps);

    scheduler.start();
    expect(clock.hasPendingFrame()).toBe(true);

    scheduler.stop();
    expect(clock.cancelled()).toHaveLength(1);
    expect(clock.hasPendingFrame()).toBe(false);
    expect(scheduler.isRunning()).toBe(false);
  });

  it('시작한 적이 없으면 정지 요청을 무시한다', () => {
    const clock = createFakeClock();
    const scheduler = createScheduler(() => {}, clock.deps);

    scheduler.stop();
    expect(clock.cancelled()).toHaveLength(0);
    expect(scheduler.isRunning()).toBe(false);
  });

  it('정지한 뒤 다시 시작할 수 있다', () => {
    const clock = createFakeClock();
    const onFrame = vi.fn();
    const scheduler = createScheduler(onFrame, clock.deps);

    scheduler.start();
    scheduler.stop();
    clock.setNow(5000);
    scheduler.start();

    expect(scheduler.isRunning()).toBe(true);
    clock.deliver(5016);
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame.mock.calls[0]?.[0]).toBeCloseTo(0.016, 6);
  });
});

describe('프레임 델타', () => {
  it('밀리초 타임스탬프를 초 단위로 변환한다', () => {
    const clock = createFakeClock(1000);
    const onFrame = vi.fn();
    const scheduler = createScheduler(onFrame, clock.deps);

    scheduler.start();
    clock.deliver(1016);
    clock.deliver(1032);
    clock.deliver(1132);

    expect(onFrame).toHaveBeenCalledTimes(3);
    expect(onFrame.mock.calls[0]?.[0]).toBeCloseTo(0.016, 6);
    expect(onFrame.mock.calls[1]?.[0]).toBeCloseTo(0.016, 6);
    expect(onFrame.mock.calls[2]?.[0]).toBeCloseTo(0.1, 6);
  });

  it('긴 공백은 최대 델타로 잘라 낸다', () => {
    const clock = createFakeClock(1000);
    const onFrame = vi.fn();
    const scheduler = createScheduler(onFrame, clock.deps);

    scheduler.start();
    clock.deliver(31_000);

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame.mock.calls[0]?.[0]).toBe(MAX_SCHEDULER_DELTA_SECONDS);
  });

  it('타임스탬프가 뒤로 가도 음수 델타를 보고하지 않는다', () => {
    const clock = createFakeClock(5000);
    const onFrame = vi.fn();
    const scheduler = createScheduler(onFrame, clock.deps);

    scheduler.start();
    clock.deliver(4000);

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame.mock.calls[0]?.[0]).toBe(0);
  });

  it('실행 중에는 프레임을 계속 요청하고, 지시받으면 멈춘다', () => {
    const clock = createFakeClock(1000);
    const onFrame = vi.fn();
    const scheduler = createScheduler(onFrame, clock.deps);

    scheduler.start();
    clock.deliver(1016);
    clock.deliver(1032);
    expect(clock.hasPendingFrame()).toBe(true);
    expect(clock.requestCount()).toBe(3);

    scheduler.stop();
    expect(clock.hasPendingFrame()).toBe(false);
    expect(onFrame).toHaveBeenCalledTimes(2);
  });
});

describe('pump', () => {
  it('양수 델타를 그대로 전달한다', () => {
    const clock = createFakeClock();
    const onFrame = vi.fn();
    const scheduler = createScheduler(onFrame, clock.deps);

    scheduler.pump(0.02);
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenLastCalledWith(0.02);
  });

  it('큰 델타를 최댓값으로 잘라 낸다', () => {
    const clock = createFakeClock();
    const onFrame = vi.fn();
    const scheduler = createScheduler(onFrame, clock.deps);

    scheduler.pump(30);
    expect(onFrame).toHaveBeenLastCalledWith(MAX_SCHEDULER_DELTA_SECONDS);
  });

  it.each<[string, number]>([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['0', 0],
    ['음수', -0.5],
  ])('%s 델타를 무시한다', (_label, delta) => {
    const clock = createFakeClock();
    const onFrame = vi.fn();
    const scheduler = createScheduler(onFrame, clock.deps);

    scheduler.pump(delta);
    expect(onFrame).not.toHaveBeenCalled();
  });

  it('루프를 시작하지도 정지하지도 않는다', () => {
    const clock = createFakeClock();
    const scheduler = createScheduler(() => {}, clock.deps);

    scheduler.pump(0.02);
    expect(scheduler.isRunning()).toBe(false);
    expect(clock.requestCount()).toBe(0);
  });
});
