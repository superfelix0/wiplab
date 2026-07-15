// localStorage 단일 키. streak 판정은 날짜 문자열 비교로만 수행(타임스탬프 계산 금지).
// localStorage 불가 환경(일부 시크릿 모드)에서도 크래시 없이 플레이는 가능해야 한다.

const KEY = 'daily_puzzle_v1';

export interface SavedState {
  schemaVersion: 1;
  lastPlayedDate: string; // KST 기준, 마지막으로 "클리어한" 날짜
  todaySolved: boolean;
  todayOps: number;
  todayStars: number;
  streak: number;
  maxStreak: number;
  totalSolved: number;
  seenHelp?: boolean;
}

const DEFAULT: SavedState = {
  schemaVersion: 1,
  lastPlayedDate: '',
  todaySolved: false,
  todayOps: 0,
  todayStars: 0,
  streak: 0,
  maxStreak: 0,
  totalSolved: 0,
  seenHelp: false,
};

function read(): SavedState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as SavedState;
    if (parsed.schemaVersion !== 1) return { ...DEFAULT };
    return { ...DEFAULT, ...parsed };
  } catch {
    return { ...DEFAULT };
  }
}

function write(state: SavedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 저장 불가 환경: 무시. 플레이는 계속 가능 */
  }
}

export function loadState(): SavedState {
  return read();
}

/** 오늘(dateStr)이 이미 클리어된 날인가 */
export function isSolvedToday(state: SavedState, dateStr: string): boolean {
  return state.todaySolved && state.lastPlayedDate === dateStr;
}

/** KST 날짜 문자열 기준 하루 전 */
export function prevDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) - 86400000;
  const p = new Date(t);
  return `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, '0')}-${String(
    p.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** 클리어 기록. streak 규칙: 어제 클리어했으면 +1, 아니면 1로 리셋. */
export function recordSolve(dateStr: string, ops: number, stars: number): SavedState {
  const state = read();
  if (isSolvedToday(state, dateStr)) return state; // 중복 기록 방지

  const continued = state.lastPlayedDate === prevDateStr(dateStr) && state.streak > 0;
  const streak = continued ? state.streak + 1 : 1;

  const next: SavedState = {
    ...state,
    lastPlayedDate: dateStr,
    todaySolved: true,
    todayOps: ops,
    todayStars: stars,
    streak,
    maxStreak: Math.max(state.maxStreak, streak),
    totalSolved: state.totalSolved + 1,
  };
  write(next);
  return next;
}

export function markHelpSeen(): void {
  const state = read();
  write({ ...state, seenHelp: true });
}
