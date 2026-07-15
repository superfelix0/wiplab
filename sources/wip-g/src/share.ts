// 공유 텍스트. 정답 유추 가능한 정보(숫자, 수식)는 절대 포함하지 않는다.

import { puzzleNumber } from './seed';

export function buildShareText(dateStr: string, usedOps: number, minOps: number, stars: number): string {
  const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  return [
    `오늘의 셈 #${puzzleNumber(dateStr)} ${starStr}`,
    `연산 ${usedOps}회 (최적 ${minOps}회)`,
    '🔢➕➖✖️➡️🎯',
    'https://wiplabs.pages.dev/wip-g/',
  ].join('\n');
}

/** 클립보드 복사. 실패 시 false 반환 → 호출부에서 폴백 UI 표시. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
