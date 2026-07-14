// 검수 체크리스트 항목: 100일치 샘플 전부 풀 수 있고 최소 연산 ≥ 3인지 검증.
// 실행: npm run verify:days

import { generatePuzzle } from '../src/generator';

const start = Date.UTC(2026, 6, 14); // 2026-07-14 (에포크)
let qualityMiss = 0;
let maxSuffix = 0;
const t0 = performance.now();

for (let i = 0; i < 100; i++) {
  const d = new Date(start + i * 86400000);
  const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
  const p = generatePuzzle(dateStr);

  if (p.minOps < 3) {
    qualityMiss++;
    console.warn(`품질 미달: ${dateStr} minOps=${p.minOps}`);
  }
  if (p.minOps < 1) throw new Error(`풀 수 없는 문제: ${dateStr}`);
  maxSuffix = Math.max(maxSuffix, p.seedSuffix);

  if (i < 7) {
    console.log(
      `#${i + 1} ${dateStr}  [${p.numbers.join(', ')}] → ${p.target}  (최적 ${p.minOps}회, 재시도 ${p.seedSuffix})`,
    );
  }
}

const elapsed = ((performance.now() - t0) / 100).toFixed(1);
console.log(`\n100일 검증 완료 — 품질 미달 ${qualityMiss}건, 최대 재시도 ${maxSuffix}, 평균 생성 ${elapsed}ms/일`);
if (qualityMiss > 0) process.exitCode = 1;
