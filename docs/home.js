const homeEls = {
  updatedAt: document.querySelector("#homeUpdatedAt"),
  comments: {
    f1: document.querySelector("#commentF1"),
    f2: document.querySelector("#commentF2"),
    f3: document.querySelector("#commentF3"),
    f4: document.querySelector("#commentF4"),
    f5: document.querySelector("#commentF5"),
  },
};

const homeNumber = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

const HOME_FORWARD_PER = 6.35;

function safeDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function pctText(value) {
  if (!Number.isFinite(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function compactMoney(value, currency = "") {
  if (!Number.isFinite(value)) return "N/A";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${homeNumber.format(abs / 1e12)}T ${currency}`;
  if (abs >= 1e9) return `${sign}${homeNumber.format(abs / 1e9)}B ${currency}`;
  if (abs >= 1e6) return `${sign}${homeNumber.format(abs / 1e6)}M ${currency}`;
  return `${sign}${homeNumber.format(abs)} ${currency}`.trim();
}

async function readJson(url) {
  const response = await fetch(`${url}?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} load failed`);
  return response.json();
}

function setComment(key, text) {
  const target = homeEls.comments[key];
  if (target) target.textContent = text;
}

function updatePerComment(data) {
  const kospi = data?.markets?.kospi200;
  if (!kospi) {
    setComment("f1", "KRX PER 데이터가 아직 준비되지 않았습니다.");
    return;
  }

  const currentPer = Number(kospi.per);
  const historicalPer = Number(kospi.historicalAveragePer);
  const forwardPer = HOME_FORWARD_PER;
  const forwardIsLow = Number.isFinite(currentPer)
    && Number.isFinite(historicalPer)
    && forwardPer < currentPer
    && forwardPer < historicalPer;

  const comment = forwardIsLow
    ? `Forward PER는 낮지만, 이익 전망 신뢰도와 평균 PER 대비 수준을 함께 봐야 합니다.`
    : `현행 ${homeNumber.format(currentPer)}배, 평균 ${homeNumber.format(historicalPer)}배, Forward ${homeNumber.format(forwardPer)}배를 함께 봅니다.`;
  setComment("f1", `${safeDate(kospi.date)} 기준 · ${comment}`);
}

function updateSentimentComment(meta) {
  const vkospi = meta?.kospi200Volatility;
  if (Number.isFinite(vkospi?.value)) {
    setComment("f2", `최근 데이터 ${safeDate(meta.lastDataDate)}, VKOSPI ${homeNumber.format(vkospi.value)}. 수급 심리와 변동성 위치를 함께 확인합니다.`);
    return;
  }
  setComment("f2", `최근 데이터 ${safeDate(meta?.lastDataDate)} 기준 개인 수급 심리를 확인합니다.`);
}

function capexOcf(latest) {
  if (!Number.isFinite(latest?.capex) || !Number.isFinite(latest?.operatingCashFlow) || latest.operatingCashFlow === 0) return null;
  return Math.abs(latest.capex) / Math.abs(latest.operatingCashFlow);
}

function updateEarningsComment(data) {
  const rows = (data?.companies || [])
    .map((company) => ({ company, latest: company.quarters?.at(-1) }))
    .filter(({ latest }) => latest);

  if (!rows.length) {
    setComment("f3", "AI 공급망과 하이퍼스케일러 실적 데이터를 확인합니다.");
    return;
  }

  const fcfPositive = rows.filter(({ latest }) => Number.isFinite(latest.freeCashFlow) && latest.freeCashFlow > 0).length;
  const capexRatios = rows.map(({ latest }) => capexOcf(latest)).filter(Number.isFinite);
  const avgCapexOcf = capexRatios.length ? capexRatios.reduce((sum, value) => sum + value, 0) / capexRatios.length : null;
  const topFcf = rows
    .filter(({ latest }) => Number.isFinite(latest.freeCashFlow))
    .sort((a, b) => b.latest.freeCashFlow - a.latest.freeCashFlow)[0];

  const fcfText = topFcf ? `FCF 최대 ${topFcf.company.name} ${compactMoney(topFcf.latest.freeCashFlow, topFcf.company.currency)}` : "FCF 비교값 확인 필요";
  const capexText = Number.isFinite(avgCapexOcf) ? `평균 CAPEX/OCF ${pctText(avgCapexOcf)}` : "CAPEX/OCF 확인 필요";
  setComment("f3", `${rows.length}개 회사 중 FCF 양수 ${fcfPositive}개. ${capexText}, ${fcfText}.`);
}

function updateLiquidityComment(data) {
  const summary = data?.summary;
  const change = summary?.marketLiquidity?.change;
  if (Number.isFinite(change)) {
    setComment("f4", `최근 3개월 실질 유동성 변화 ${change >= 0 ? "+" : ""}${homeNumber.format(change)}B USD. ${summary.label || "중립"} 구간입니다.`);
    return;
  }
  setComment("f4", "M2, 지급준비금, RRP, TGA 흐름을 종합해 미국 유동성 방향을 봅니다.");
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

    updatePerComment(per);
    updateSentimentComment(sentiment);
    updateEarningsComment(earnings);
    updateLiquidityComment(liquidity);

    const timestamps = [per?.generatedAt, sentiment?.generatedAt, liquidity?.generatedAt, earnings?.generatedAt].filter(Boolean);
    if (homeEls.updatedAt) {
      homeEls.updatedAt.textContent = timestamps.length ? `최근 업데이트 ${timestamps.sort().at(-1)}` : "업데이트 정보 없음";
    }
  } catch {
    setComment("f1", "데이터 요약을 불러오지 못했습니다. 각 페이지에서 개별 지표를 확인할 수 있습니다.");
    if (homeEls.updatedAt) homeEls.updatedAt.textContent = "데이터 확인 실패";
  }
}

loadHomeRead();
