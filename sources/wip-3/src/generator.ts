// 역방향 생성: 숫자를 먼저 뽑고 연산을 적용해 목표를 도출한다 → 풀 수 있음이 구조적으로 보장.
// 품질 검사: 솔버로 최소 연산 ≥ 3 확인. 불통과 시 시드 접미사(-1, -2, ...)로 전체 재생성.
// 검사 로직까지 전부 결정적이므로 모든 기기가 같은 재시도 경로를 밟아 같은 문제에 도달한다.

import { fnv1a, mulberry32 } from './seed';
import { minOpsToTarget, validResults } from './solver';

export interface Puzzle {
  dateStr: string;
  numbers: number[]; // 6개
  target: number; // 101~999
  minOps: number; // 최적해 연산 횟수 (별점 기준)
  seedSuffix: number; // 디버그용: 몇 번째 재시도에서 채택됐나
}

const LARGE_POOL = [15, 20, 25];
const MIN_TARGET = 101;
const MAX_TARGET = 999;
const MIN_QUALITY_OPS = 3;
const MAX_SEED_RETRIES = 20;

function pickNumbers(rand: () => number): number[] {
  // 작은 수 4개: 1~10, 같은 수 최대 2회
  const counts = new Map<number, number>();
  const smalls: number[] = [];
  while (smalls.length < 4) {
    const v = 1 + Math.floor(rand() * 10);
    const c = counts.get(v) ?? 0;
    if (c < 2) {
      counts.set(v, c + 1);
      smalls.push(v);
    }
  }
  // 큰 수 2개: 15/20/25 중 중복 없이
  const pool = [...LARGE_POOL];
  const larges: number[] = [];
  for (let i = 0; i < 2; i++) {
    const idx = Math.floor(rand() * pool.length);
    larges.push(pool.splice(idx, 1)[0]);
  }
  return [...smalls, ...larges];
}

/**
 * 뽑힌 숫자들에 무작위 연산을 3~5회 적용해 목표를 도출한다.
 * 목표가 범위를 벗어나면 같은 PRNG 시퀀스를 이어 쓰며 재시도(결정성 유지).
 * 성공 시 목표값, 일정 횟수 실패 시 null.
 */
function deriveTarget(numbers: number[], rand: () => number): number | null {
  for (let attempt = 0; attempt < 50; attempt++) {
    let pool = [...numbers];
    const opsToApply = 3 + Math.floor(rand() * 3); // 3~5회
    let last = -1;
    let ok = true;
    for (let step = 0; step < opsToApply; step++) {
      const i = Math.floor(rand() * pool.length);
      let j = Math.floor(rand() * (pool.length - 1));
      if (j >= i) j++;
      const results = validResults(pool[i], pool[j]);
      if (results.length === 0) {
        ok = false;
        break;
      }
      const r = results[Math.floor(rand() * results.length)];
      const rest = pool.filter((_, k) => k !== i && k !== j);
      pool = [...rest, r];
      last = r;
    }
    if (ok && last >= MIN_TARGET && last <= MAX_TARGET && !numbers.includes(last)) {
      return last;
    }
  }
  return null;
}

/** 해당 날짜의 문제를 결정적으로 생성한다. */
export function generatePuzzle(dateStr: string): Puzzle {
  let fallback: Puzzle | null = null;

  for (let suffix = 0; suffix <= MAX_SEED_RETRIES; suffix++) {
    const seedStr = suffix === 0 ? dateStr : `${dateStr}-${suffix}`;
    const rand = mulberry32(fnv1a(seedStr));

    const numbers = pickNumbers(rand);
    const target = deriveTarget(numbers, rand);
    if (target === null) continue;

    const minOps = minOpsToTarget(numbers, target);
    if (minOps < 0) continue; // 역방향 생성상 불가능하지만 방어

    const puzzle: Puzzle = { dateStr, numbers, target, minOps, seedSuffix: suffix };
    if (minOps >= MIN_QUALITY_OPS) return puzzle;
    fallback = puzzle; // 품질 미달이어도 마지막 후보는 보관
  }

  // 안전장치: 모든 재시도가 품질 미달이면 마지막 유효 후보 채택 (무한루프 방지)
  if (fallback) return fallback;
  throw new Error(`puzzle generation failed for ${dateStr}`);
}
