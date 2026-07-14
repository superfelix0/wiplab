# 오늘의 셈 — WIP 3

WIP Labs의 세 번째 실험. 하루 한 문제 숫자 퍼즐(Digits/Countdown 계열).

숫자 6개(작은 수 1~10 네 개 + 큰 수 15/20/25 두 개)와 사칙연산으로 3자리 목표 숫자를 정확히 만들면 클리어. 중간 결과는 항상 양의 정수. 되돌리기 무제한, 시도 제한 없음.

## 핵심 설계

- **결정적 생성**: KST 날짜 문자열 → FNV-1a → mulberry32 PRNG. 같은 날 = 전원 같은 문제. 문제 DB·서버·크론 없음.
- **역방향 생성**: 숫자를 먼저 뽑고 연산을 적용해 목표를 도출하므로 풀 수 있음이 구조적으로 보장.
- **품질 검사**: 솔버(BFS + 멀티셋 메모)로 최소 연산 ≥ 3 확인. 미달 시 시드 접미사(`-1`, `-2`, …)로 결정적 재시도.
- **별점**: 최적해 대비 사용 연산 횟수 (동일 ★★★ / +1 ★★ / 그 외 ★).
- 생성·솔버는 Web Worker에서 실행. 상태는 `localStorage` 단일 키(`daily_puzzle_v1`), streak 판정은 날짜 문자열 비교로만.

## 개발

```bash
npm install
npm run dev          # 개발 서버
npm test             # 유닛 테스트 (결정성/생성 제약/솔버/streak)
npm run verify:days  # 100일치 문제 생성 검증
npm run build        # dist/ 산출 (base: /wip-3/)
```

## 배포

`vite.config.ts`의 `base: '/wip-3/'` 기준. `dist/`를 wiplabs.pages.dev의 `/wip-3/` 경로에 올리면 끝.

스택: Vite + TypeScript, 프레임워크·런타임 의존성 없음.
