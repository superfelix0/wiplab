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

async function readText(url) {
  const response = await fetch(`${url}?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} load failed`);
  return response.text();
}

function setComment(key, text) {
  const target = homeEls.comments[key];
  if (target) target.textContent = text;
}

function homeToNumber(value) {
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return NaN;
  return Number(String(value).replaceAll(",", "").trim());
}

function parseSentimentCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  const dateIndex = headers.indexOf("date");
  const closeIndex = headers.indexOf("close");
  const flowIndex = headers.indexOf("indiv_krw");
  if (dateIndex < 0 || closeIndex < 0 || flowIndex < 0) return [];

  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return {
      date: cells[dateIndex]?.trim(),
      close: homeToNumber(cells[closeIndex]),
      indivKrw: homeToNumber(cells[flowIndex]),
    };
  }).filter((row) => row.date && Number.isFinite(row.close) && Number.isFinite(row.indivKrw));
}

function homeRegression(points) {
  const n = points.length;
  if (n < 3) return null;

  const meanX = points.reduce((sum, p) => sum + p.ret, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.indivT, 0) / n;
  const ssX = points.reduce((sum, p) => sum + (p.ret - meanX) ** 2, 0);
  const cov = points.reduce((sum, p) => sum + (p.ret - meanX) * (p.indivT - meanY), 0);
  const slope = ssX === 0 ? 0 : cov / ssX;
  const intercept = meanY - slope * meanX;
  const residuals = points.map((p) => p.indivT - (intercept + slope * p.ret));
  const sse = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const sd = Math.sqrt(sse / Math.max(1, n - 2)) || 1;
  return { slope, intercept, sd };
}

function homeWeekKey(dateText) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() + (5 - day));
  return date.toISOString().slice(0, 10);
}

function homeWeeklySeries(rows) {
  const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
  const weeks = new Map();

  for (const row of sorted) {
    const key = homeWeekKey(row.date);
    if (!weeks.has(key)) {
      weeks.set(key, { key, date: row.date, firstClose: row.close, close: row.close, indivKrw: 0 });
    }
    const week = weeks.get(key);
    week.date = row.date;
    week.close = row.close;
    week.indivKrw += row.indivKrw;
  }

  const grouped = Array.from(weeks.values()).sort((a, b) => a.key.localeCompare(b.key));
  return grouped.slice(1).map((week, index) => {
    const previous = grouped[index];
    return {
      date: week.date,
      close: week.close,
      indivT: week.indivKrw / 1e12,
      ret: ((week.close / previous.close) - 1) * 100,
    };
  });
}

function latestHomeSentiment(rows) {
  const points = homeWeeklySeries(rows);
  const model = homeRegression(points);
  if (!model || !points.length) return null;

  const thr = 1.45;
  const band = 0.8;
  return points.map((point) => {
    const expected = model.intercept + model.slope * point.ret;
    const residual = point.indivT - expected;
    const z = residual / model.sd;
    const type = point.ret <= band && z <= -thr ? "fear" : point.ret >= -band && z >= thr ? "greed" : "normal";
    return { ...point, expected, residual, z, type };
  }).at(-1);
}

function homeSentimentLabel(point) {
  if (!point) {
    return {
      label: "상태 확인 필요",
      detail: "개인 수급 데이터를 충분히 불러오지 못했습니다.",
    };
  }

  const residual = Math.abs(point.residual).toFixed(2);
  if (point.type === "fear") {
    return {
      label: "공포 신호",
      detail: `개인 순매수가 평소 예상보다 ${residual}조원 부족했습니다.`,
    };
  }
  if (point.type === "greed") {
    return {
      label: "탐욕 신호",
      detail: `개인 순매수가 평소 예상보다 ${residual}조원 많았습니다.`,
    };
  }
  if (Math.abs(point.z) < 0.25) {
    return {
      label: "괜찮은 상태",
      detail: "개인 수급이 평소 범위에서 크게 벗어나지 않았습니다.",
    };
  }
  if (point.z < 0) {
    return {
      label: "공포 근접",
      detail: `정식 공포 신호는 아니지만 개인 순매수가 예상보다 ${residual}조원 부족했습니다.`,
    };
  }
  return {
    label: "탐욕 근접",
    detail: `정식 탐욕 신호는 아니지만 개인 순매수가 예상보다 ${residual}조원 많았습니다.`,
  };
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

function updateSentimentComment(meta, rows = []) {
  const latest = latestHomeSentiment(rows);
  const view = homeSentimentLabel(latest);
  const vkospi = meta?.kospi200Volatility;
  const date = safeDate(latest?.date || meta?.lastDataDate);
  const vkospiText = Number.isFinite(vkospi?.value) ? ` VKOSPI ${homeNumber.format(vkospi.value)}.` : "";
  setComment("f2", `${date} 기준 · ${view.label}. ${view.detail}${vkospiText}`);
}

function capexOcf(latest) {
  if (!Number.isFinite(latest?.capex) || !Number.isFinite(latest?.operatingCashFlow) || latest.operatingCashFlow === 0) return null;
  return Math.abs(latest.capex) / Math.abs(latest.operatingCashFlow);
}

function capexNi(latest) {
  if (!Number.isFinite(latest?.capex) || !Number.isFinite(latest?.profit) || latest.profit <= 0) return null;
  return Math.abs(latest.capex) / latest.profit;
}

function averageFinite(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function capexBurdenLabel(capexToOcf, capexToNi) {
  if (!Number.isFinite(capexToOcf) && !Number.isFinite(capexToNi)) return "확인 필요";
  if ((capexToOcf ?? 0) <= 0.7 && (capexToNi ?? 0) <= 0.9) return "여유";
  if ((capexToOcf ?? 0) <= 1.0 && (capexToNi ?? 0) <= 1.2) return "관리 가능";
  return "부담 확대";
}

function updateEarningsComment(data) {
  const rows = (data?.companies || [])
    .filter((company) => company.group === "Hyperscaler")
    .map((company) => ({ company, latest: company.quarters?.at(-1) }))
    .filter(({ latest }) => latest);

  if (!rows.length) {
    setComment("f3", "하이퍼스케일러 CAPEX 부담을 확인합니다.");
    return;
  }

  const avgCapexOcf = averageFinite(rows.map(({ latest }) => capexOcf(latest)));
  const avgCapexNi = averageFinite(rows.map(({ latest }) => capexNi(latest)));
  const label = capexBurdenLabel(avgCapexOcf, avgCapexNi);
  setComment("f3", `하이퍼스케일러 CAPEX 부담: ${label}. 평균 CAPEX/OCF ${pctText(avgCapexOcf)}, CAPEX/순이익 ${pctText(avgCapexNi)}.`);
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

function updateAdrComment(data) {
  const premium = Number(data?.result?.premium);
  if (!Number.isFinite(premium)) {
    setComment("f5", "괴리율 확인 중");
    return;
  }

  setComment("f5", `괴리율 ${pctText(premium)}`);
}

async function loadHomeRead() {
  try {
    const [perResult, sentimentResult, sentimentRowsResult, liquidityResult, earningsResult, adrResult] = await Promise.allSettled([
      readJson("data/market-per.json"),
      readJson("data/kospi-sentiment-meta.json"),
      readText("data/kospi-sentiment.csv"),
      readJson("data/us-liquidity.json"),
      readJson("data/ai-earnings.json"),
      readJson("/api/quotes"),
    ]);

    const per = perResult.status === "fulfilled" ? perResult.value : null;
    const sentiment = sentimentResult.status === "fulfilled" ? sentimentResult.value : null;
    const sentimentRows = sentimentRowsResult.status === "fulfilled" ? parseSentimentCsv(sentimentRowsResult.value) : [];
    const liquidity = liquidityResult.status === "fulfilled" ? liquidityResult.value : null;
    const earnings = earningsResult.status === "fulfilled" ? earningsResult.value : null;
    const adr = adrResult.status === "fulfilled" ? adrResult.value : null;

    updatePerComment(per);
    updateSentimentComment(sentiment, sentimentRows);
    updateEarningsComment(earnings);
    updateLiquidityComment(liquidity);
    updateAdrComment(adr);

    const timestamps = [per?.generatedAt, sentiment?.generatedAt, liquidity?.generatedAt, earnings?.generatedAt, adr?.fetchedAt].filter(Boolean);
    if (homeEls.updatedAt) {
      homeEls.updatedAt.textContent = timestamps.length ? `최근 업데이트 ${timestamps.sort().at(-1)}` : "업데이트 정보 없음";
    }
  } catch {
    setComment("f1", "데이터 요약을 불러오지 못했습니다. 각 페이지에서 개별 지표를 확인할 수 있습니다.");
    if (homeEls.updatedAt) homeEls.updatedAt.textContent = "데이터 확인 실패";
  }
}

loadHomeRead();
