/**
 * 이력 버퍼.
 *
 * 실행 이력은 페이지가 살아 있는 동안 고정 용량 메모리에만 담기므로, 차트와
 * 타임라인 스크러버가 결국 기대는 것은 링 버퍼의 순환 동작이다.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_EVENTS,
  MAX_SNAPSHOTS,
  RingBuffer,
  SNAPSHOT_INTERVAL_TICKS,
  clampSnapshotIndex,
  createEventBuffer,
  createSnapshotBuffer,
} from '@/simulation/snapshots';

function fill<T>(buffer: RingBuffer<T>, items: readonly T[]): void {
  for (const item of items) buffer.push(item);
}

describe('RingBuffer 생성', () => {
  it('요청한 용량을 노출하고 비어 있는 상태로 시작한다', () => {
    const buffer = new RingBuffer<number>(4);
    expect(buffer.capacity).toBe(4);
    expect(buffer.size).toBe(0);
    expect(buffer.toArray()).toEqual([]);
    expect(buffer.at(0)).toBeUndefined();
  });

  it.each<[string, number]>([
    ['0', 0],
    ['음수', -1],
    ['소수', 2.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('%s 용량에 대해 RangeError를 던진다', (_label, capacity) => {
    expect(() => new RingBuffer<number>(capacity)).toThrow(RangeError);
  });
});

describe('RingBuffer 삽입 순서', () => {
  it('용량에 못 미치는 동안에는 삽입 순서를 유지한다', () => {
    const buffer = new RingBuffer<string>(5);
    fill(buffer, ['a', 'b', 'c']);

    expect(buffer.size).toBe(3);
    expect(buffer.toArray()).toEqual(['a', 'b', 'c']);
    expect(buffer.at(0)).toBe('a');
    expect(buffer.at(2)).toBe('c');
    expect(buffer.at(3)).toBeUndefined();
  });

  it('용량에 도달하면 가장 오래된 항목을 덮어쓴다', () => {
    const buffer = new RingBuffer<number>(3);
    fill(buffer, [1, 2, 3, 4]);

    expect(buffer.size).toBe(3);
    expect(buffer.toArray()).toEqual([2, 3, 4]);
  });

  it('여러 번 순환해도 오래된 것부터 정렬을 유지한다', () => {
    const buffer = new RingBuffer<number>(3);
    fill(buffer, [1, 2, 3, 4, 5, 6, 7, 8]);

    expect(buffer.size).toBe(3);
    expect(buffer.toArray()).toEqual([6, 7, 8]);
  });

  it('순환한 뒤에도 인덱스가 정확하다', () => {
    const buffer = new RingBuffer<number>(4);
    fill(buffer, [10, 20, 30, 40, 50, 60]);

    expect(buffer.toArray()).toEqual([30, 40, 50, 60]);
    expect(buffer.at(0)).toBe(30);
    expect(buffer.at(1)).toBe(40);
    expect(buffer.at(2)).toBe(50);
    expect(buffer.at(3)).toBe(60);
    expect(buffer.at(4)).toBeUndefined();
    expect(buffer.at(-1)).toBeUndefined();
  });

  it('어떤 채움 길이에서도 모든 인덱스가 toArray와 일치한다', () => {
    for (let pushes = 0; pushes < 20; pushes += 1) {
      const buffer = new RingBuffer<number>(5);
      for (let value = 0; value < pushes; value += 1) buffer.push(value);

      const asArray = buffer.toArray();
      expect(asArray).toHaveLength(Math.min(pushes, 5));
      for (let index = 0; index < asArray.length; index += 1) {
        expect(buffer.at(index), `push 횟수=${pushes} 인덱스=${index}`).toBe(
          asArray[index],
        );
      }
    }
  });

  it('clear하면 비워지고 처음부터 다시 채울 수 있다', () => {
    const buffer = new RingBuffer<number>(3);
    fill(buffer, [1, 2, 3, 4, 5]);
    expect(buffer.toArray()).toEqual([3, 4, 5]);

    buffer.clear();
    expect(buffer.size).toBe(0);
    expect(buffer.toArray()).toEqual([]);
    expect(buffer.at(0)).toBeUndefined();

    fill(buffer, [7, 8]);
    expect(buffer.toArray()).toEqual([7, 8]);
    expect(buffer.at(0)).toBe(7);
  });
});

describe('버퍼 팩토리', () => {
  it('문서에 적힌 기본 용량을 쓴다', () => {
    expect(createSnapshotBuffer().capacity).toBe(MAX_SNAPSHOTS);
    expect(createEventBuffer().capacity).toBe(MAX_EVENTS);
  });

  it('명시한 용량을 받아들인다', () => {
    expect(createSnapshotBuffer(12).capacity).toBe(12);
    expect(createEventBuffer(12).capacity).toBe(12);
  });

  it('스냅샷을 고정 스텝의 정수배마다 기록한다', () => {
    expect(Number.isInteger(SNAPSHOT_INTERVAL_TICKS)).toBe(true);
    expect(SNAPSHOT_INTERVAL_TICKS).toBeGreaterThan(0);
  });
});

describe('clampSnapshotIndex', () => {
  it('되짚어 볼 이력이 없으면 null을 반환한다', () => {
    expect(clampSnapshotIndex(0, 0)).toBeNull();
    expect(clampSnapshotIndex(5, 0)).toBeNull();
    expect(clampSnapshotIndex(-5, 0)).toBeNull();
    expect(clampSnapshotIndex(0, -3)).toBeNull();
  });

  it('유효 범위 안으로 제한한다', () => {
    expect(clampSnapshotIndex(-10, 4)).toBe(0);
    expect(clampSnapshotIndex(0, 4)).toBe(0);
    expect(clampSnapshotIndex(3, 4)).toBe(3);
    expect(clampSnapshotIndex(4, 4)).toBe(3);
    expect(clampSnapshotIndex(1000, 4)).toBe(3);
  });

  it('소수 인덱스를 가장 가까운 위치로 반올림한다', () => {
    expect(clampSnapshotIndex(1.4, 4)).toBe(1);
    expect(clampSnapshotIndex(1.6, 4)).toBe(2);
    expect(clampSnapshotIndex(0.4, 4)).toBe(0);
    expect(clampSnapshotIndex(-1.4, 4)).toBe(0);
    expect(clampSnapshotIndex(3.6, 4)).toBe(3);
  });

  it('유한하지 않은 입력은 가장 최신 위치로 되돌린다', () => {
    expect(clampSnapshotIndex(Number.NaN, 4)).toBe(3);
    expect(clampSnapshotIndex(Number.POSITIVE_INFINITY, 4)).toBe(3);
    expect(clampSnapshotIndex(Number.NEGATIVE_INFINITY, 4)).toBe(3);
  });

  it('항목이 하나뿐인 이력에서도 언제나 배열 안에 안착한다', () => {
    for (const index of [-1, 0, 0.5, 1, 99, Number.NaN]) {
      expect(clampSnapshotIndex(index, 1)).toBe(0);
    }
  });
});
