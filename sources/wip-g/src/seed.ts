// 날짜 → 시드 → PRNG. 전 과정이 결정적이어야 한다.
// 같은 KST 날짜 = 같은 시드 = 같은 문제. 이것이 "전원 동일 문제"의 유일한 담보 장치.

/** FNV-1a 32bit 해시 */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — 시드 기반 결정적 PRNG. [0, 1) 반환 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST(UTC+9) 기준 YYYY-MM-DD. 기기 로컬 시간대에 절대 의존하지 않는다. */
export function kstDateStr(now: number = Date.now()): string {
  const d = new Date(now + KST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 서비스 기준일. 이 날이 #1. */
export const EPOCH_DATE = '2026-07-14';

/** 날짜 문자열 → 에포크 기준 문제 번호 (#N). */
export function puzzleNumber(dateStr: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(dateStr) - toUtc(EPOCH_DATE)) / 86400000) + 1;
}

/** 다음 KST 자정까지 남은 ms */
export function msUntilNextKstMidnight(now: number = Date.now()): number {
  const kstNow = now + KST_OFFSET_MS;
  const nextMidnight = (Math.floor(kstNow / 86400000) + 1) * 86400000;
  return nextMidnight - kstNow;
}
