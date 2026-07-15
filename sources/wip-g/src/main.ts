import type { Puzzle } from './generator';
import { kstDateStr } from './seed';
import { isSolvedToday, loadState } from './storage';
import { mountApp, mountSolvedScreen } from './ui';

const root = document.getElementById('app')!;
// 문제는 "로드한 날짜" 기준으로 고정. 플레이 도중 자정이 지나도 세션은 유지된다.
const dateStr = kstDateStr();

const worker = new Worker(new URL('./puzzle.worker.ts', import.meta.url), { type: 'module' });

worker.onmessage = (e: MessageEvent<Puzzle>) => {
  const puzzle = e.data;
  worker.terminate();
  const state = loadState();
  if (isSolvedToday(state, dateStr)) {
    mountSolvedScreen(root, puzzle, state);
  } else {
    mountApp(root, puzzle);
  }
};

worker.onerror = () => {
  // Worker 실패 시 메인 스레드에서 동기 생성으로 폴백
  worker.terminate();
  import('./generator').then(({ generatePuzzle }) => {
    const puzzle = generatePuzzle(dateStr);
    const state = loadState();
    if (isSolvedToday(state, dateStr)) {
      mountSolvedScreen(root, puzzle, state);
    } else {
      mountApp(root, puzzle);
    }
  });
};

worker.postMessage({ dateStr });
