'use client';

/**
 * 키보드 안내.
 *
 * `useKeyboardControls`를 그대로 반영한다. 여기 적힌 모든 단축키는 화면에 보이는
 * 컨트롤로도 조작할 수 있으므로, 키보드가 유일한 경로가 되는 일은 없다.
 */

interface Shortcut {
  readonly keys: string;
  readonly action: string;
}

const SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Space', action: '실행을 재생하거나 일시정지' },
  { keys: 'R', action: '선택한 시나리오 프리셋으로 네트워크 초기화' },
  { keys: 'S', action: '네트워크를 한 구간만큼 진행' },
  { keys: '←', action: '타임라인 커서를 한 샘플 이전으로 이동' },
  { keys: '→', action: '타임라인 커서를 한 샘플 이후로 이동' },
  { keys: 'Home', action: '가장 오래된 기록 샘플로 이동' },
  { keys: 'End', action: '가장 최근 기록 샘플로 이동' },
  { keys: 'L', action: '타임라인에서 나와 실시간 보기로 복귀' },
  { keys: 'C', action: '전체 카메라 스토리 시작 또는 종료' },
  { keys: 'Escape', action: '노드 선택 해제' },
];

export function KeyboardHelp() {
  return (
    <details className="rounded-lg border border-line bg-surface-1 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-ink-0">
        키보드 단축키
      </summary>
      <p className="mt-2 text-xs text-ink-2">
        슬라이더, 텍스트 필드, 메뉴에 포커스가 있거나 조합키를 누르고 있는 동안에는
        단축키가 물러난다. 그래서 입력과 슬라이더 미세 조정은 언제나 기대한 대로
        동작한다.
      </p>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.keys} className="contents">
            <dt className="font-mono text-xs text-accent">
              <kbd>{shortcut.keys}</kbd>
            </dt>
            <dd className="text-ink-1">{shortcut.action}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
