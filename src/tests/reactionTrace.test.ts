import { describe, expect, it } from 'vitest';
import {
  getInteractionNeighbors,
  getReactionTrace,
} from '@/simulation/reactionTrace';

describe('상류 반응 경로', () => {
  it('Thrombin 선택 시 Factor IX부터 생성 경로 전체를 포함한다', () => {
    const trace = getReactionTrace('thrombin');
    expect([...trace.reactionIds]).toEqual([
      'r4-conversion',
      'r3-conversion',
      'r2-binding',
      'r1-activation',
    ]);
    expect(trace.entityIds).toEqual(
      new Set([
        'thrombin',
        'prothrombin',
        'factorXa',
        'factorX',
        'tenaseComplex',
        'factorIXa',
        'factorIX',
        'platelets',
        'factorVIIIa',
      ]),
    );
  });

  it('Fibrin 선택 시 다섯 생산 반응을 모두 포함한다', () => {
    const trace = getReactionTrace('fibrin');
    expect(trace.reactionIds).toEqual(
      new Set([
        'r5-conversion',
        'r4-conversion',
        'r3-conversion',
        'r2-binding',
        'r1-activation',
      ]),
    );
    expect(trace.entityIds.has('fibrinogen')).toBe(true);
    expect(trace.entityIds.has('thrombin')).toBe(true);
  });

  it('시작 노드와 억제자는 생산 경로 없이 자신만 포함한다', () => {
    expect(getReactionTrace('factorIX').reactionIds.size).toBe(0);
    expect(getReactionTrace('tfpi').entityIds).toEqual(new Set(['tfpi']));
  });
});

describe('hover 이웃', () => {
  it('Tenase의 같은 결합·전환 참여자를 반환한다', () => {
    const neighbors = getInteractionNeighbors('tenaseComplex');
    expect(neighbors.has('factorIXa')).toBe(true);
    expect(neighbors.has('factorVIIIa')).toBe(true);
    expect(neighbors.has('factorXa')).toBe(true);
    expect(neighbors.has('antithrombin')).toBe(false);
  });
});
