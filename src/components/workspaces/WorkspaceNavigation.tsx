'use client';

import { useSimulationStore, type WorkspaceId } from '@/store/simulationStore';

export const WORKSPACES: readonly { id: WorkspaceId; label: string; shortLabel: string }[] = [
  { id: 'simulation', label: '시뮬레이션', shortLabel: '관찰' },
  { id: 'scenarios', label: '시나리오 비교', shortLabel: '회복 곡선' },
  { id: 'parameters', label: '파라미터 지도', shortLabel: '평면' },
  { id: 'reactions', label: '반응 탐색기', shortLabel: '분석' },
  { id: 'molecules', label: '분자 탐색기', shortLabel: '구조' },
  { id: 'knowledge', label: '지식 자료', shortLabel: '참고' },
];

export function WorkspaceNavigation({ onSearch }: { onSearch(): void }) {
  const workspace = useSimulationStore((state) => state.workspace);
  const setWorkspace = useSimulationStore((state) => state.setWorkspace);

  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
      <nav aria-label="작업공간" className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-lg bg-surface-0/70 p-1">
        {WORKSPACES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={workspace === item.id ? 'page' : undefined}
            onClick={() => setWorkspace(item.id)}
            className={`group whitespace-nowrap rounded-md px-3 py-1.5 text-left transition-colors ${
              workspace === item.id
                ? 'bg-surface-3 text-ink-0 shadow-sm'
                : 'text-ink-2 hover:bg-surface-2 hover:text-ink-1'
            }`}
          >
            <span className="block text-xs font-semibold">{item.label}</span>
            <span className="hidden text-[0.6rem] text-ink-2 xl:block">{item.shortLabel}</span>
          </button>
        ))}
      </nav>
      <button
        type="button"
        onClick={onSearch}
        className="hidden rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-1 hover:border-line-strong hover:text-ink-0 sm:block"
        aria-label="전역 검색 및 명령 팔레트 열기"
      >
        검색 <kbd className="ml-2 font-mono text-[0.62rem] text-ink-2">⌘K</kbd>
      </button>
    </div>
  );
}
