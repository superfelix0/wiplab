// 플레이 세션 상태. 메모리에만 존재하며 저장하지 않는다(새로고침 시 처음부터).

export type Op = '+' | '-' | '×' | '÷';

export interface Tile {
  id: number;
  value: number;
}

export interface HistoryEntry {
  a: number;
  b: number;
  op: Op;
  result: number;
}

interface Snapshot {
  tiles: Tile[];
  history: HistoryEntry[];
}

export class Game {
  tiles: Tile[];
  history: HistoryEntry[] = [];
  readonly target: number;
  private undoStack: Snapshot[] = [];
  private nextId: number;

  constructor(numbers: number[], target: number) {
    this.tiles = numbers.map((value, i) => ({ id: i, value }));
    this.nextId = numbers.length;
    this.target = target;
  }

  get opsCount(): number {
    return this.history.length;
  }

  get solved(): boolean {
    return this.tiles.some((t) => t.value === this.target);
  }

  /** 두 타일을 연산으로 결합. 결과가 양의 정수가 아니면 null 반환(상태 불변). */
  combine(idA: number, idB: number, op: Op): Tile | null {
    const a = this.tiles.find((t) => t.id === idA);
    const b = this.tiles.find((t) => t.id === idB);
    if (!a || !b || idA === idB) return null;

    const result = applyOp(a.value, b.value, op);
    if (result === null) return null;

    this.undoStack.push({ tiles: [...this.tiles], history: [...this.history] });
    const newTile: Tile = { id: this.nextId++, value: result };
    this.tiles = this.tiles.filter((t) => t.id !== idA && t.id !== idB).concat(newTile);
    this.history.push({ a: a.value, b: b.value, op, result });
    return newTile;
  }

  /** 연산 1회 되돌리기. 되돌릴 게 없으면 false. */
  undo(): boolean {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    this.tiles = snap.tiles;
    this.history = snap.history;
    return true;
  }

  /** 처음 상태로 리셋 */
  reset(): void {
    while (this.undo()) {
      /* undo until empty */
    }
  }
}

/** 연산 적용. 양의 정수가 아니면 null. */
export function applyOp(a: number, b: number, op: Op): number | null {
  switch (op) {
    case '+':
      return a + b;
    case '×':
      return a * b;
    case '-': {
      const d = a - b;
      return d > 0 ? d : null;
    }
    case '÷': {
      if (b === 0 || a % b !== 0) return null;
      const q = a / b;
      return q > 0 ? q : null;
    }
  }
}

/** 별점: 최적해 대비 사용 연산 횟수 */
export function starsFor(usedOps: number, minOps: number): 1 | 2 | 3 {
  if (usedOps <= minOps) return 3;
  if (usedOps === minOps + 1) return 2;
  return 1;
}
