import type { EntityId } from '@/simulation/types';

export interface MolStarSelectionPort {
  select(entityId: EntityId): void;
  clear(): void;
}

/** 양방향 선택 동기화. 재진입 가드가 되돌아오는 갱신을 끊는다. */
export class MolStarSelectionBridge {
  #syncing = false;

  constructor(
    private readonly port: MolStarSelectionPort,
    private readonly updateApplicationSelection: (entityId: EntityId | null) => void,
  ) {}

  applicationSelectionChanged(entityId: EntityId | null): void {
    if (this.#syncing) return;
    if (entityId === null) this.port.clear();
    else this.port.select(entityId);
  }

  rendererSelectionChanged(entityId: EntityId | null): void {
    if (this.#syncing) return;
    this.#syncing = true;
    try {
      this.updateApplicationSelection(entityId);
    } finally {
      this.#syncing = false;
    }
  }
}
