// 최소 연산 횟수 솔버.
// 상태 = 숫자 멀티셋. BFS로 깊이(=연산 횟수)별 탐색 → 최초 도달 깊이가 최솟값.
// 6개 숫자 기준 상태 공간은 수십만 수준. 메인 스레드에서는 Worker를 통해 호출한다.

/** 유효한 이항 연산 결과들(양의 정수만). */
export function validResults(a: number, b: number): number[] {
  const out: number[] = [a + b, a * b];
  const diff = Math.abs(a - b);
  if (diff > 0) out.push(diff);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  if (lo !== 0 && hi % lo === 0) {
    const q = hi / lo;
    if (q > 0) out.push(q);
  }
  // 중복 제거 (예: a===b일 때 a+b === a*b 인 2,2)
  return [...new Set(out)];
}

function keyOf(nums: number[]): string {
  return [...nums].sort((x, y) => x - y).join(',');
}

/**
 * numbers에서 target을 만드는 최소 연산 횟수. 불가능하면 -1.
 * maxDepth 초과 탐색은 하지 않는다(numbers 6개면 최대 5회로 충분).
 */
export function minOpsToTarget(numbers: number[], target: number): number {
  if (numbers.includes(target)) return 0;
  const maxDepth = numbers.length - 1;
  let frontier: number[][] = [numbers];
  const visited = new Set<string>([keyOf(numbers)]);

  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: number[][] = [];
    for (const state of frontier) {
      const n = state.length;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const rest: number[] = [];
          for (let k = 0; k < n; k++) if (k !== i && k !== j) rest.push(state[k]);
          for (const r of validResults(state[i], state[j])) {
            if (r === target) return depth;
            const ns = [...rest, r];
            const key = keyOf(ns);
            if (!visited.has(key)) {
              visited.add(key);
              next.push(ns);
            }
          }
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return -1;
}
