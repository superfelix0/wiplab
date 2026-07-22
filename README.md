# WIP Labs

계속 만들고 고쳐보는 작은 웹 실험실입니다.

WIP Labs는 한국 주식시장과 반도체 업황을 중심으로 재무지표와 시장 흐름을 비교하는 작은 리서치 실험실입니다.

## 배포

- Cloudflare Pages
- Build command: 없음
- Build output directory: `docs`
- Pages Function: `functions/api/market-ticker.js`, `functions/api/kospi-sentiment.js`, `functions/api/vix.js`

Cloudflare가 빌드 설정을 잘못 읽지 않도록 `wrangler.toml`에도 Pages 출력 경로를 명시했습니다.

## WIP 3 데이터 갱신

`WIP 3 — KOSPI Fear/Greed Sentiment`는 `docs/data/kospi-sentiment.csv`가 있으면 이 파일을 우선 읽습니다. 수집 시각과 데이터 기준일은 `docs/data/kospi-sentiment-meta.json`에 저장하고 화면에 함께 표시합니다.

CSV 형식:

```csv
date,close,indiv_krw
2026-07-15,3215.28,-123456789000
```

GitHub Actions의 `Update KOSPI market data` 워크플로가 한국 거래일 19:00 KST에 `scripts/update_kospi_sentiment.py`와 `scripts/update_market_per.py`를 실행해 CSV와 메타 JSON을 갱신합니다. pykrx/KRX 인증이 필요한 경우 GitHub 저장소 Settings → Secrets and variables → Actions에 `KRX_ID`, `KRX_PW`를 등록해야 합니다.

## F3·F4 실적 갱신

`Update AI earnings data` 워크플로가 Yahoo Finance 공개 분기·일별 종가 데이터를 미국장 종료 후 한국시간 06:00, 한국장 종료 후 19:00에 확인합니다. 새 분기나 수치 변경이 있을 때만 `docs/data/ai-earnings.json`을 갱신하므로, 실적이 없는 날에는 불필요한 커밋을 만들지 않습니다.

- F3: 하이퍼스케일러의 CAPEX/OCF, CAPEX/순이익, FCF와 최신 결산 핵심을 표시합니다.
- F4: 메모리 제조사의 매출 증감, 영업이익 증감, 영업이익률과 최신 결산 핵심을 표시합니다.
- 실시간 조회가 실패하면 마지막 정상 데이터를 보존합니다.
- 새 분기 발견 이력은 `releaseHistory`, 회사별 최신 해설은 `latestHighlight.ko`와 `latestHighlight.en`에 저장됩니다.

무료 공개 원천의 반영 시차와 회사별 회계 기준 차이가 있으므로, 화면의 최신 결산일과 회사 IR 공시일을 함께 확인해야 합니다.
