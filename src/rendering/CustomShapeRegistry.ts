export type CustomShapeKind = 'vessel' | 'conceptual-entities';

export interface CustomShapeRegistration {
  readonly id: CustomShapeKind;
  readonly label: string;
  readonly selectable: boolean;
}

const REGISTRATIONS: readonly CustomShapeRegistration[] = [
  { id: 'vessel', label: '관 경계와 손상 영역', selectable: false },
  { id: 'conceptual-entities', label: '분자 개념 대체 표시', selectable: true },
];

export class CustomShapeRegistry {
  readonly #items = new Map(REGISTRATIONS.map((item) => [item.id, item]));

  get(id: CustomShapeKind): CustomShapeRegistration {
    const item = this.#items.get(id);
    if (!item) throw new RangeError(`알 수 없는 custom shape: ${id}`);
    return item;
  }

  list(): readonly CustomShapeRegistration[] {
    return [...this.#items.values()];
  }
}

export const customShapeRegistry = new CustomShapeRegistry();
