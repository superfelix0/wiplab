import { describe, expect, it } from 'vitest';
import { generatePuzzle } from '../src/generator';
import { Game, applyOp, starsFor } from '../src/game';
import { fnv1a, kstDateStr, mulberry32, puzzleNumber } from '../src/seed';
import { minOpsToTarget } from '../src/solver';
import { prevDateStr } from '../src/storage';

describe('seed 결정성', () => {
  it('같은 날짜 문자열 → 같은 시드 → 같은 난수 시퀀스', () => {
    const a = mulberry32(fnv1a('2026-07-14'));
    const b = mulberry32(fnv1a('2026-07-14'));
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('다른 날짜 → 다른 시퀀스', () => {
    const a = mulberry32(fnv1a('2026-07-14'));
    const b = mulberry32(fnv1a('2026-07-15'));
    const seqA = Array.from({ length: 10 }, a);
    const seqB = Array.from({ length: 10 }, b);
    expect(seqA).not.toEqual(seqB);
  });

  it('KST 날짜 계산: UTC 15:00 = KST 자정 경계', () => {
    // 2026-07-14T15:00:00Z == 2026-07-15T00:00:00+09:00
    expect(kstDateStr(Date.UTC(2026, 6, 14, 14, 59, 59))).toBe('2026-07-14');
    expect(kstDateStr(Date.UTC(2026, 6, 14, 15, 0, 0))).toBe('2026-07-15');
  });

  it('문제 번호: 에포크가 #1', () => {
    expect(puzzleNumber('2026-07-14')).toBe(1);
    expect(puzzleNumber('2026-07-15')).toBe(2);
  });
});

describe('generator', () => {
  it('같은 날짜로 두 번 생성하면 완전히 동일한 문제', () => {
    const a = generatePuzzle('2026-07-14');
    const b = generatePuzzle('2026-07-14');
    expect(a).toEqual(b);
  });

  it('생성 제약: 숫자 6개(작은 수 4 + 큰 수 2), 목표 101~999', () => {
    for (const d of ['2026-07-14', '2026-08-01', '2026-12-25']) {
      const p = generatePuzzle(d);
      expect(p.numbers).toHaveLength(6);
      const smalls = p.numbers.filter((n) => n >= 1 && n <= 10);
      const larges = p.numbers.filter((n) => [15, 20, 25].includes(n));
      expect(smalls).toHaveLength(4);
      expect(larges).toHaveLength(2);
      expect(new Set(larges).size).toBe(2); // 큰 수 중복 없음
      for (const s of smalls) {
        expect(smalls.filter((x) => x === s).length).toBeLessThanOrEqual(2);
      }
      expect(p.target).toBeGreaterThanOrEqual(101);
      expect(p.target).toBeLessThanOrEqual(999);
      expect(p.minOps).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('solver', () => {
  it('알려진 케이스: 목표가 이미 존재하면 0', () => {
    expect(minOpsToTarget([3, 5, 101], 101)).toBe(0);
  });

  it('알려진 케이스: 6×25=150 → 1회', () => {
    expect(minOpsToTarget([6, 25, 1, 2, 3, 4], 150)).toBe(1);
  });

  it('알려진 케이스: (4+2)×25=150 → 2회', () => {
    expect(minOpsToTarget([4, 2, 25, 7, 9, 1], 150)).toBe(2);
  });

  it('불가능 케이스: -1', () => {
    expect(minOpsToTarget([1, 1], 999)).toBe(-1);
  });

  it('음수/분수 경로는 사용하지 않는다: 3-5 불가, 5/3 불가', () => {
    // 3과 5만으로 2는 만들 수 있어도(5-3), -2나 5/3 경로는 없음
    expect(minOpsToTarget([3, 5], 2)).toBe(1);
    expect(minOpsToTarget([3, 5], 15)).toBe(1);
  });
});

describe('game', () => {
  it('applyOp: 양의 정수만 허용', () => {
    expect(applyOp(3, 5, '-')).toBeNull();
    expect(applyOp(5, 3, '-')).toBe(2);
    expect(applyOp(5, 3, '÷')).toBeNull();
    expect(applyOp(6, 3, '÷')).toBe(2);
    expect(applyOp(3, 3, '-')).toBeNull(); // 0 불허
  });

  it('combine/undo/reset 라운드트립', () => {
    const g = new Game([2, 3, 25, 1, 1, 7], 100);
    const t1 = g.combine(0, 1, '+'); // 2+3=5
    expect(t1?.value).toBe(5);
    expect(g.tiles).toHaveLength(5);
    g.combine(t1!.id, 2, '×'); // 5×25=125
    expect(g.opsCount).toBe(2);
    expect(g.undo()).toBe(true);
    expect(g.opsCount).toBe(1);
    g.reset();
    expect(g.opsCount).toBe(0);
    expect(g.tiles).toHaveLength(6);
  });

  it('클리어 판정: 목표 타일 생성 시 solved', () => {
    const g = new Game([4, 25, 1, 1, 1, 1], 100);
    g.combine(0, 1, '×');
    expect(g.solved).toBe(true);
  });

  it('별점 기준', () => {
    expect(starsFor(3, 3)).toBe(3);
    expect(starsFor(4, 3)).toBe(2);
    expect(starsFor(5, 3)).toBe(1);
  });
});

describe('streak 날짜 판정', () => {
  it('prevDateStr: 월/연 경계 포함', () => {
    expect(prevDateStr('2026-07-15')).toBe('2026-07-14');
    expect(prevDateStr('2026-08-01')).toBe('2026-07-31');
    expect(prevDateStr('2026-01-01')).toBe('2025-12-31');
    expect(prevDateStr('2028-03-01')).toBe('2028-02-29'); // 윤년
  });
});
