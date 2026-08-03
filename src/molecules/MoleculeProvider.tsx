'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { getMoleculeRecord } from './catalog';
import type { EntityId } from '@/simulation/types';
import type { MoleculeRecord } from './types';

const MoleculeContext = createContext<MoleculeRecord | null>(null);

export function MoleculeProvider({
  entityId,
  children,
}: {
  readonly entityId: EntityId;
  readonly children: ReactNode;
}) {
  const record = useMemo(() => getMoleculeRecord(entityId), [entityId]);
  return <MoleculeContext.Provider value={record}>{children}</MoleculeContext.Provider>;
}

export function useMolecule(): MoleculeRecord {
  const record = useContext(MoleculeContext);
  if (!record) throw new Error('useMolecule은 MoleculeProvider 안에서만 쓸 수 있다.');
  return record;
}

