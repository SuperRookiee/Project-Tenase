'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { SimulationWorkspace } from '@/components/workspaces/SimulationWorkspace';
import { CommandPalette } from '@/components/workspaces/CommandPalette';
import { WorkspaceNavigation } from '@/components/workspaces/WorkspaceNavigation';
import { useKeyboardControls } from '@/hooks/useKeyboardControls';
import { useSimulationClock } from '@/hooks/useSimulationClock';
import { useSimulationStore } from '@/store/simulationStore';
import { selectDisplayed } from '@/store/simulationStore';
import { getEntity } from '@/simulation/entities';

const ReactionExplorerWorkspace = dynamic(() => import('@/components/workspaces/ReactionExplorerWorkspace').then((module) => module.ReactionExplorerWorkspace));
const MoleculeExplorerWorkspace = dynamic(() => import('@/components/workspaces/MoleculeExplorerWorkspace').then((module) => module.MoleculeExplorerWorkspace));
const KnowledgeWorkspace = dynamic(() => import('@/components/workspaces/KnowledgeWorkspace').then((module) => module.KnowledgeWorkspace));

export function AppShell() {
  useSimulationClock();
  useKeyboardControls();
  const workspace = useSimulationStore((state) => state.workspace);
  const running = useSimulationStore((state) => state.running);
  const toggleRunning = useSimulationStore((state) => state.toggleRunning);
  const time = useSimulationStore((state) => selectDisplayed(state).time);
  const historical = useSimulationStore((state) => selectDisplayed(state).isHistorical);
  const selectedId = useSimulationStore((state) => state.selectedEntityId);
  const selected = selectedId ? getEntity(selectedId) : null;
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }
      if (event.key === 'Escape') setPaletteOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-surface-0 text-ink-0 lg:h-screen lg:min-h-0">
      <a href="#main-region" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface-2 focus:px-3 focus:py-2">본문 영역으로 건너뛰기</a>
      <header className="z-30 shrink-0 border-b border-line/70 bg-surface-1/90 px-3 py-2 backdrop-blur-xl sm:px-5">
        <div className="mx-auto flex max-w-[118rem] flex-wrap items-center gap-3">
          <div className="min-w-fit"><h1 className="text-sm font-semibold tracking-tight">Project Tenase</h1><p className="hidden text-[0.6rem] text-ink-2 lg:block">분자 시스템 작업공간</p></div>
          <WorkspaceNavigation onSearch={() => setPaletteOpen(true)} />
          <div className="order-3 flex w-full items-center justify-between gap-2 border-t border-line/60 pt-2 sm:order-none sm:w-auto sm:border-0 sm:pt-0">
            <button type="button" onClick={toggleRunning} aria-label={running ? '시뮬레이션 일시정지' : '시뮬레이션 재생'} className="grid size-8 place-items-center rounded-full border border-line bg-surface-2 text-xs text-ink-0 hover:bg-surface-3">
              {running ? 'Ⅱ' : '▶'}
            </button>
            <div className="min-w-20">
              <p className="font-mono text-[0.68rem] text-ink-0">t {time.toFixed(2)}</p>
              <p className={`text-[0.58rem] ${historical ? 'text-caution' : running ? 'text-accent' : 'text-ink-2'}`}>{historical ? '기록 재생' : running ? '실시간' : '일시정지'}</p>
            </div>
            <div className="hidden min-w-24 border-l border-line pl-3 2xl:block">
              <p className="text-[0.55rem] uppercase tracking-wider text-ink-2">선택됨</p>
              <p className="mt-0.5 truncate text-[0.68rem] font-semibold text-ink-1">{selected?.label ?? '없음'}</p>
            </div>
          </div>
        </div>
      </header>
      <main id="main-region" tabIndex={-1} className="relative min-h-0 flex-1 overflow-y-auto">
        {workspace === 'simulation' ? <SimulationWorkspace /> : null}
        {workspace === 'reactions' ? <ReactionExplorerWorkspace /> : null}
        {workspace === 'molecules' ? <MoleculeExplorerWorkspace /> : null}
        {workspace === 'knowledge' ? <KnowledgeWorkspace /> : null}
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
