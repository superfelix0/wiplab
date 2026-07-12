# WIP Lab

계속 만들고 고쳐보는 작은 웹 실험실입니다.

현재 첫 번째 실험은 ADR과 국내 상장 주식의 원화 기준 가격 차이를 비교하는 `ADR Gap Monitor`입니다.

## 배포

- Cloudflare Pages
- Build command: 없음
- Build output directory: `docs`
- Pages Function: `functions/api/quotes.js`

Cloudflare가 빌드 설정을 잘못 읽지 않도록 `wrangler.toml`에도 Pages 출력 경로를 명시했습니다.
