'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ENTITY_DEFINITIONS } from '@/simulation/entities';
import { REACTION_DEFINITIONS } from '@/simulation/reactions';
import { useSimulationStore, type WorkspaceId } from '@/store/simulationStore';
import { WORKSPACES } from './WorkspaceNavigation';

interface Command {
  readonly id: string;
  readonly label: string;
  readonly context: string;
  run(): void;
}

export function CommandPalette({ open, onClose }: { readonly open: boolean; onClose(): void }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const setWorkspace = useSimulationStore((state) => state.setWorkspace);
  const openMolecule = useSimulationStore((state) => state.openMoleculeExplorer);
  const selectEntity = useSimulationStore((state) => state.selectEntity);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      setQuery('');
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const commands = useMemo<readonly Command[]>(() => [
    ...WORKSPACES.map((workspace) => ({
      id: `workspace-${workspace.id}`,
      label: workspace.label,
      context: '작업공간 열기',
      run: () => setWorkspace(workspace.id as WorkspaceId),
    })),
    ...ENTITY_DEFINITIONS.map((entity) => ({
      id: `entity-${entity.id}`,
      label: entity.label,
      context: '분자 탐색기에서 열기',
      run: () => openMolecule(entity.id),
    })),
    ...REACTION_DEFINITIONS.map((reaction) => ({
      id: `reaction-${reaction.id}`,
      label: reaction.label,
      context: '반응 탐색기에서 열기',
      run: () => {
        selectEntity(reaction.products[0]?.entityId ?? reaction.reactants[0]?.entityId ?? null);
        setWorkspace('reactions');
      },
    })),
  ], [openMolecule, selectEntity, setWorkspace]);

  const normalized = query.trim().toLowerCase();
  const filtered = commands.filter((command) =>
    normalized.length === 0
      ? true
      : `${command.label} ${command.context}`.toLowerCase().includes(normalized),
  ).slice(0, 12);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-surface-0/75 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-heading"
        className="h-fit w-full max-w-2xl overflow-hidden rounded-2xl border border-line-strong bg-surface-1 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="command-palette-heading" className="sr-only">전역 검색 및 명령 팔레트</h2>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'Enter' && filtered[0]) {
              filtered[0].run();
              onClose();
            }
          }}
          placeholder="작업공간, 분자, 반응 검색…"
          className="w-full border-b border-line bg-transparent px-5 py-4 text-base text-ink-0 outline-none placeholder:text-ink-2"
        />
        <ul className="max-h-[55vh] overflow-y-auto p-2">
          {filtered.map((command) => (
            <li key={command.id}>
              <button
                type="button"
                onClick={() => {
                  command.run();
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-surface-2"
              >
                <span className="text-sm font-medium text-ink-0">{command.label}</span>
                <span className="text-xs text-ink-2">{command.context}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 ? <li className="px-3 py-8 text-center text-sm text-ink-2">일치하는 항목이 없습니다.</li> : null}
        </ul>
      </section>
    </div>
  );
}
