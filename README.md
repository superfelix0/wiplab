# WIP Labs

계속 만들고 고쳐보는 작은 웹 실험실입니다.

현재 첫 번째 실험은 ADR과 국내 상장 주식의 원화 기준 가격 차이를 비교하는 `ADR Gap Monitor`입니다.

## 배포

- Cloudflare Pages
- Build command: 없음
- Build output directory: `docs`
- Pages Function: `functions/api/quotes.js`, `functions/api/market-dashboard.js`, `functions/api/kospi-sentiment.js`

Cloudflare가 빌드 설정을 잘못 읽지 않도록 `wrangler.toml`에도 Pages 출력 경로를 명시했습니다.

## WIP 3 데이터 갱신

`WIP 3 — KOSPI Fear/Greed Sentiment`는 `docs/data/kospi-sentiment.csv`가 있으면 이 파일을 우선 읽습니다. 수집 시각과 데이터 기준일은 `docs/data/kospi-sentiment-meta.json`에 저장하고 화면에 함께 표시합니다.

CSV 형식:

```csv
date,close,indiv_krw
2026-07-15,3215.28,-123456789000
```

GitHub Actions의 `Update KOSPI sentiment data` 워크플로가 평일 18:10 KST에 `scripts/update_kospi_sentiment.py`를 실행해 CSV와 메타 JSON을 갱신합니다. pykrx/KRX 인증이 필요한 경우 GitHub 저장소 Settings → Secrets and variables → Actions에 `KRX_ID`, `KRX_PW`를 등록해야 합니다.
