// 문제 생성(내부에서 솔버로 품질 검사 포함)을 메인 스레드 밖에서 수행.
// 입력: dateStr, 출력: Puzzle.

import { generatePuzzle } from './generator';

self.onmessage = (e: MessageEvent<{ dateStr: string }>) => {
  const puzzle = generatePuzzle(e.data.dateStr);
  self.postMessage(puzzle);
};
