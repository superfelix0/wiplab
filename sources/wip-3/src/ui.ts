// DOM 렌더링과 인터랙션. 프레임워크 없음.
// 인터랙션: 숫자 탭 → 연산자 탭 → 숫자 탭 = 결합. 잘못된 연산은 흔들림 + 선택 해제.

import { Game, starsFor, type Op } from './game';
import type { Puzzle } from './generator';
import { msUntilNextKstMidnight, puzzleNumber } from './seed';
import { buildShareText, copyToClipboard } from './share';
import { loadState, markHelpSeen, recordSolve, type SavedState } from './storage';

const OPS: Op[] = ['+', '-', '×', '÷'];

interface Selection {
  tileA: number | null;
  op: Op | null;
}

export function mountApp(root: HTMLElement, puzzle: Puzzle): void {
  const state = loadState();
  const game = new Game(puzzle.numbers, puzzle.target);
  const sel: Selection = { tileA: null, op: null };

  root.innerHTML = '';
  root.append(buildHeader(puzzle, state));

  const targetZone = el('div', 'target-zone');
  const targetLabel = el('div', 'target-label');
  targetLabel.textContent = '목표';
  const targetValue = el('div', 'target-value');
  targetValue.textContent = String(puzzle.target);
  targetZone.append(targetLabel, targetValue);

  const tilesGrid = el('div', 'tiles');
  const opsRow = el('div', 'ops');
  const controls = el('div', 'controls');
  const historyBox = el('div', 'history');

  const undoBtn = button('ctrl', '되돌리기', () => {
    if (game.undo()) {
      clearSelection();
      render();
    }
  });
  const resetBtn = button('ctrl', '처음부터', () => {
    game.reset();
    clearSelection();
    render();
  });
  const helpBtn = button('ctrl', '규칙', () => root.append(buildHelpOverlay(false)));
  controls.append(undoBtn, resetBtn, helpBtn);

  for (const op of OPS) {
    const b = button('op', op, () => {
      if (sel.tileA === null) return; // 숫자 먼저
      sel.op = sel.op === op ? null : op;
      render();
    });
    b.dataset.op = op;
    opsRow.append(b);
  }

  root.append(targetZone, tilesGrid, opsRow, controls, historyBox);

  function clearSelection(): void {
    sel.tileA = null;
    sel.op = null;
  }

  function onTileTap(id: number): void {
    if (sel.tileA === null) {
      sel.tileA = id;
    } else if (sel.tileA === id && sel.op === null) {
      sel.tileA = null; // 같은 타일 재탭 = 선택 해제
    } else if (sel.op === null) {
      sel.tileA = id; // 연산자 없이 다른 타일 = 선택 이동
    } else {
      const newTile = game.combine(sel.tileA, id, sel.op);
      if (newTile === null) {
        // 비정수/음수: 흔들림 + 선택 해제
        tilesGrid.classList.remove('shake');
        void tilesGrid.offsetWidth; // reflow로 애니메이션 재시작
        tilesGrid.classList.add('shake');
        clearSelection();
        render();
        return;
      }
      clearSelection();
      render(newTile.id);
      if (game.solved) onSolved();
      return;
    }
    render();
  }

  function render(newTileId?: number): void {
    tilesGrid.innerHTML = '';
    for (const t of game.tiles) {
      const b = button('tile', String(t.value), () => onTileTap(t.id));
      if (sel.tileA === t.id) b.classList.add('selected');
      if (newTileId === t.id) b.classList.add('new');
      b.setAttribute('aria-pressed', String(sel.tileA === t.id));
      tilesGrid.append(b);
    }
    for (const b of opsRow.querySelectorAll<HTMLButtonElement>('.op')) {
      b.classList.toggle('selected', sel.op === b.dataset.op);
    }
    undoBtn.disabled = game.opsCount === 0;
    resetBtn.disabled = game.opsCount === 0;

    historyBox.innerHTML = '';
    for (const h of game.history) {
      const row = el('div', 'row');
      row.innerHTML = `${h.a} ${h.op} ${h.b} = <strong>${h.result}</strong>`;
      historyBox.append(row);
    }
    targetValue.classList.toggle('hit', game.solved);
  }

  function onSolved(): void {
    const stars = starsFor(game.opsCount, puzzle.minOps);
    const saved = recordSolve(puzzle.dateStr, game.opsCount, stars);
    setTimeout(() => root.append(buildResultOverlay(puzzle, saved)), 350);
  }

  render();

  if (!state.seenHelp) {
    root.append(buildHelpOverlay(true));
  }
}

/** 이미 클리어한 날의 결과 화면 */
export function mountSolvedScreen(root: HTMLElement, puzzle: Puzzle, state: SavedState): void {
  root.innerHTML = '';
  root.append(buildHeader(puzzle, state));
  const overlayLess = buildResultCard(puzzle, state);
  const wrap = el('div', 'target-zone');
  wrap.style.margin = 'auto 0';
  wrap.append(overlayLess);
  root.append(wrap);
}

/* ---------- 조립 헬퍼 ---------- */

function buildHeader(puzzle: Puzzle, state: SavedState): HTMLElement {
  const bar = el('header', 'bar');
  const brand = el('div', 'brand');
  brand.innerHTML = `<a href="/">WIP Labs</a> · 오늘의 셈 #${puzzleNumber(puzzle.dateStr)}`;
  const meta = el('div', 'meta');
  meta.textContent = state.streak > 0 ? `연속 ${state.streak}일` : '';
  bar.append(brand, meta);
  return bar;
}

function buildResultCard(puzzle: Puzzle, state: SavedState): HTMLElement {
  const card = el('div', 'card');
  const h = el('h2');
  h.textContent = '오늘 것 끝!';
  const stars = el('div', 'stars');
  stars.textContent = '★'.repeat(state.todayStars) + '☆'.repeat(3 - state.todayStars);

  const statRow = el('div', 'big-stat');
  statRow.innerHTML = `
    <div><strong>${state.todayOps}</strong>연산 (최적 ${puzzle.minOps})</div>
    <div><strong>${state.streak}</strong>연속일</div>
    <div><strong>${state.totalSolved}</strong>누적</div>`;

  const shareBtn = button('btn', '결과 복사', async () => {
    const text = buildShareText(puzzle.dateStr, state.todayOps, puzzle.minOps, state.todayStars);
    if (await copyToClipboard(text)) {
      shareBtn.textContent = '복사됨';
      setTimeout(() => (shareBtn.textContent = '결과 복사'), 1500);
    } else {
      // 폴백: 선택 가능한 텍스트 노출
      if (!card.querySelector('.share-fallback')) {
        const ta = document.createElement('textarea');
        ta.className = 'share-fallback';
        ta.value = text;
        ta.rows = 4;
        ta.readOnly = true;
        ta.onclick = () => ta.select();
        card.append(ta);
      }
    }
  });

  const countdown = el('div', 'countdown');
  const tick = () => {
    const ms = msUntilNextKstMidnight();
    const h2 = Math.floor(ms / 3600000);
    const m2 = Math.floor((ms % 3600000) / 60000);
    countdown.textContent = `다음 문제까지 ${h2}시간 ${m2}분`;
  };
  tick();
  setInterval(tick, 30000);

  card.append(h, stars, statRow, shareBtn, countdown);
  return card;
}

function buildResultOverlay(puzzle: Puzzle, state: SavedState): HTMLElement {
  const overlay = el('div', 'overlay');
  const card = buildResultCard(puzzle, state);
  const close = button('btn quiet', '닫기', () => overlay.remove());
  card.append(close);
  overlay.append(card);
  return overlay;
}

function buildHelpOverlay(firstVisit: boolean): HTMLElement {
  const overlay = el('div', 'overlay');
  const card = el('div', 'card');
  card.innerHTML = `
    <h2>오늘의 셈</h2>
    <p>숫자 두 개와 연산 하나를 골라 결합하면 새 숫자가 됩니다.</p>
    <p>중간 결과는 항상 양의 정수. 목표 숫자를 정확히 만들면 클리어.</p>
    <p>하루 한 문제, 모두 같은 문제입니다. 되돌리기는 무제한이에요.</p>`;
  const ok = button('btn', firstVisit ? '시작' : '닫기', () => {
    if (firstVisit) markHelpSeen();
    overlay.remove();
  });
  card.append(ok);
  overlay.append(card);
  return overlay;
}

function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = className;
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
