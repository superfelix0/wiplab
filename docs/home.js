const homeEls = {
  summary: document.querySelector("#todaySummary"),
  updatedAt: document.querySelector("#homeUpdatedAt"),
};

const homeNumber = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

function safeDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function pctText(value) {
  if (!Number.isFinite(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function card(tone, label, title, detail, href) {
  return `
    <a class="today-card" data-tone="${tone}" href="${href}">
      <span>${label}</span>
      <strong>${title}</strong>
      <small>${detail}</small>
      <em>자세히 보기 →</em>
    </a>
  `;
}

async function readJson(url) {
  const response = await fetch(`${url}?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} load failed`);
  return response.json();
}

function buildPerCard(data) {
  const kospi = data?.markets?.kospi200;
  if (!kospi) return card("neutral", "F1 · VALUE", "KOSPI PER 데이터 확인 필요", "KRX PER 데이터가 아직 준비되지 않았습니다.", "wip-1/");
  const gap = kospi.per - kospi.historicalAveragePer;
  const tone = Math.abs(gap) < 0.5 ? "neutral" : gap > 0 ? "negative" : "positive";
  const title = gap > 0.5 ? "역사적 평균보다 비싼 편" : gap < -0.5 ? "역사적 평균보다 낮은 편" : "역사적 평균 부근";
  return card(
    tone,
    "F1 · VALUE",
    title,
    `최근 ${safeDate(kospi.date)} 기준 PER ${homeNumber.format(kospi.per)}배, 역사적 평균 ${homeNumber.format(kospi.historicalAveragePer)}배`,
    "wip-1/"
  );
}

function buildSentimentCard(meta) {
  const vkospi = meta?.kospi200Volatility;
  const tone = Number.isFinite(vkospi?.value) && vkospi.value >= 70 ? "negative" : "neutral";
  const title = Number.isFinite(vkospi?.value) && vkospi.value >= 70 ? "변동성 경계 구간" : "수급·변동성 점검";
  const detail = Number.isFinite(vkospi?.value)
    ? `최근 데이터 ${safeDate(meta.lastDataDate)}, VKOSPI ${homeNumber.format(vkospi.value)}`
    : `최근 데이터 ${safeDate(meta?.lastDataDate)} 기준 개인 수급 심리를 확인합니다.`;
  return card(tone, "F2 · SENTIMENT", title, detail, "wip-2/");
}

function buildLiquidityCard(data) {
  const summary = data?.summary;
  const tone = summary?.tone || "neutral";
  const title = tone === "positive" ? "미국 유동성 우호적" : tone === "negative" ? "미국 유동성 부담" : "미국 유동성 중립";
  const change = summary?.marketLiquidity?.change;
  const detail = Number.isFinite(change)
    ? `최근 3개월 실질 유동성 변화 ${change >= 0 ? "+" : ""}${homeNumber.format(change)}B USD`
    : "M2, 지급준비금, RRP, TGA 흐름을 종합합니다.";
  return card(tone, "F4 · LIQUIDITY", title, detail, "wip-4/");
}

function buildEarningsCard(data) {
  const rows = (data?.companies || [])
    .map((company) => ({ company, latest: company.quarters?.at(-1) }))
    .filter(({ latest }) => latest);
  const intensities = rows
    .map(({ latest }) => {
      if (!Number.isFinite(latest.capex)) return null;
      const denom = Math.abs(latest.operatingExpense || latest.ebitda || 0);
      return denom ? Math.abs(latest.capex) / denom : null;
    })
    .filter(Number.isFinite);
  const avg = intensities.length ? intensities.reduce((sum, value) => sum + value, 0) / intensities.length : null;
  const tone = Number.isFinite(avg) && avg > 1 ? "negative" : "neutral";
  const title = Number.isFinite(avg) ? "AI CAPEX 투자강도 확인" : "AI 실적 데이터 확인 필요";
  const detail = Number.isFinite(avg)
    ? `최근 분기 평균 CAPEX/OPEX ${pctText(avg)} · ${rows.length}개 기업 커버`
    : "AI 공급망과 하이퍼스케일러 실적을 비교합니다.";
  return card(tone, "F3 · AI CAPEX", title, detail, "wip-3/");
}

async function loadHomeRead() {
  try {
    const [perResult, sentimentResult, liquidityResult, earningsResult] = await Promise.allSettled([
      readJson("data/market-per.json"),
      readJson("data/kospi-sentiment-meta.json"),
      readJson("data/us-liquidity.json"),
      readJson("data/ai-earnings.json"),
    ]);

    const per = perResult.status === "fulfilled" ? perResult.value : null;
    const sentiment = sentimentResult.status === "fulfilled" ? sentimentResult.value : null;
    const liquidity = liquidityResult.status === "fulfilled" ? liquidityResult.value : null;
    const earnings = earningsResult.status === "fulfilled" ? earningsResult.value : null;

    homeEls.summary.innerHTML = [
      buildPerCard(per),
      buildSentimentCard(sentiment),
      buildEarningsCard(earnings),
      buildLiquidityCard(liquidity),
    ].join("");

    const timestamps = [per?.generatedAt, sentiment?.generatedAt, liquidity?.generatedAt, earnings?.generatedAt].filter(Boolean);
    homeEls.updatedAt.textContent = timestamps.length ? `최근 업데이트 ${timestamps.sort().at(-1)}` : "업데이트 정보 없음";
  } catch {
    homeEls.summary.innerHTML = card("neutral", "MARKET READ", "요약을 불러오지 못했습니다", "각 WIP 페이지에서 개별 지표를 확인할 수 있습니다.", "wip-1/");
    homeEls.updatedAt.textContent = "데이터 확인 실패";
  }
}

loadHomeRead();
