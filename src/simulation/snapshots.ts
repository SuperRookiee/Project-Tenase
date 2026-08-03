/**
 * 고정 용량 이력 버퍼.
 *
 * 모든 시뮬레이션 이력은 페이지가 살아 있는 동안 메모리에만 존재한다. 여기 있는
 * 어떤 코드도 localStorage, sessionStorage, 쿠키, IndexedDB, 네트워크를 건드리지
 * 않는다. 탭을 닫으면 실행 기록이 통째로 사라지며, 이는 의도된 설계다.
 */
import type { ReactionEvent, SimulationSnapshot } from './types';

/** 차트와 타임라인 스크러버를 위해 보관하는 스냅샷 수. */
export const MAX_SNAPSHOTS = 600;
/** 인스펙터의 최근 이벤트 목록을 위해 보관하는 반응 이벤트 수. */
export const MAX_EVENTS = 64;
/** 스냅샷을 기록하는 간격, 고정 스텝 수 기준. */
export const SNAPSHOT_INTERVAL_TICKS = 6;

/**
 * 삽입 순서대로 항목을 내놓는 최소한의 링 버퍼.
 *
 * 의도적으로 단순하게 유지했다. `toArray`는 메모리를 할당하므로, 호출자는
 * 시뮬레이션 스텝마다가 아니라 UI 갱신 주기에 맞춰 읽어야 한다.
 */
export class RingBuffer<T> {
  readonly capacity: number;
  private readonly items: T[] = [];
  private start = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(
        `링 버퍼 용량은 양의 정수여야 하지만 다음 값을 받았다: ${capacity}`,
      );
    }
    this.capacity = capacity;
  }

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    if (this.items.length < this.capacity) {
      this.items.push(item);
      return;
    }
    this.items[this.start] = item;
    this.start = (this.start + 1) % this.capacity;
  }

  /** 가장 오래된 항목부터 반환한다. */
  toArray(): T[] {
    if (this.items.length < this.capacity || this.start === 0) {
      return [...this.items];
    }
    return [...this.items.slice(this.start), ...this.items.slice(0, this.start)];
  }

  at(index: number): T | undefined {
    if (index < 0 || index >= this.items.length) return undefined;
    return this.items[(this.start + index) % this.capacity];
  }

  clear(): void {
    this.items.length = 0;
    this.start = 0;
  }
}

export function createSnapshotBuffer(
  capacity: number = MAX_SNAPSHOTS,
): RingBuffer<SimulationSnapshot> {
  return new RingBuffer<SimulationSnapshot>(capacity);
}

export function createEventBuffer(
  capacity: number = MAX_EVENTS,
): RingBuffer<ReactionEvent> {
  return new RingBuffer<ReactionEvent>(capacity);
}

/**
 * 임의의 인덱스를 유효한 스냅샷 위치로 범위 제한한다.
 * 스크러브할 이력이 없으면 `null`을 반환한다.
 */
export function clampSnapshotIndex(
  index: number,
  length: number,
): number | null {
  if (length <= 0) return null;
  if (!Number.isFinite(index)) return length - 1;
  const rounded = Math.round(index);
  if (rounded < 0) return 0;
  if (rounded > length - 1) return length - 1;
  return rounded;
}
