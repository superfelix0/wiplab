const homeEls = {
  updatedAt: document.querySelector("#homeUpdatedAt"),
  comments: {
    f1: document.querySelector("#commentF1"),
    f2: document.querySelector("#commentF2"),
    f3: document.querySelector("#commentF3"),
    f4: document.querySelector("#commentF4"),
    f5: document.querySelector("#commentF5"),
    f6: document.querySelector("#commentF6"),
  },
};

const IS_EN = document.documentElement.lang?.toLowerCase().startsWith("en");
const homeNumber = new Intl.NumberFormat(IS_EN ? "en-US" : "ko-KR", { maximumFractionDigits: 2 });
const HOME_FORWARD_PER = 6.35;

function ht(ko, en) {
  return IS_EN ? en : ko;
}

function safeDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function pctText(value) {
  if (!Number.isFinite(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
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

function toNumber(value) {
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
    return { date: cells[dateIndex]?.trim(), close: toNumber(cells[closeIndex]), indivKrw: toNumber(cells[flowIndex]) };
  }).filter((row) => row.date && Number.isFinite(row.close) && Number.isFinite(row.indivKrw));
}

function regression(points) {
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

function weekKey(dateText) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() + (5 - day));
  return date.toISOString().slice(0, 10);
}

function weeklySeries(rows) {
  const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
  const weeks = new Map();
  for (const row of sorted) {
    const key = weekKey(row.date);
    if (!weeks.has(key)) weeks.set(key, { key, date: row.date, close: row.close, indivKrw: 0 });
    const week = weeks.get(key);
    week.date = row.date;
    week.close = row.close;
    week.indivKrw += row.indivKrw;
  }
  const grouped = Array.from(weeks.values()).sort((a, b) => a.key.localeCompare(b.key));
  return grouped.slice(1).map((week, index) => {
    const previous = grouped[index];
    return { date: week.date, close: week.close, indivT: week.indivKrw / 1e12, ret: week.close / previous.close - 1 };
  });
}

function latestSentiment(rows) {
  const points = weeklySeries(rows);
  const model = regression(points.map((p) => ({ ...p, ret: p.ret * 100 })));
  if (!model || !points.length) return null;
  const threshold = 1.45;
  const band = 0.8;
  return points.map((point) => {
    const retPct = point.ret * 100;
    const expected = model.intercept + model.slope * retPct;
    const residual = point.indivT - expected;
    const z = residual / model.sd;
    const type = retPct <= band && z <= -threshold ? "fear" : retPct >= -band && z >= threshold ? "greed" : "normal";
    return { ...point, retPct, expected, residual, z, type };
  }).at(-1);
}

function sentimentView(point) {
  if (!point) return { label: ht("확인 필요", "Needs data"), detail: ht("개인 수급 데이터가 아직 충분하지 않습니다.", "Retail-flow data is not sufficient yet.") };
  const residual = Math.abs(point.residual).toFixed(2);
  if (point.type === "fear") return { label: ht("공포 신호", "Fear signal"), detail: ht(`개인 순매수가 평소 추정치보다 ${residual}조원 부족했습니다.`, `Retail net-buying was ${residual}T KRW below its usual estimate.`) };
  if (point.type === "greed") return { label: ht("탐욕 신호", "Greed signal"), detail: ht(`개인 순매수가 평소 추정치보다 ${residual}조원 많았습니다.`, `Retail net-buying was ${residual}T KRW above its usual estimate.`) };
  return point.z < 0
    ? { label: ht("공포 근접", "Near fear"), detail: ht(`개인 순매수가 추정치보다 ${residual}조원 낮습니다.`, `Retail net-buying was ${residual}T KRW below estimate.`) }
    : { label: ht("탐욕 근접", "Near greed"), detail: ht(`개인 순매수가 추정치보다 ${residual}조원 높습니다.`, `Retail net-buying was ${residual}T KRW above estimate.`) };
}

function updatePerComment(data) {
  const kospi = data?.markets?.kospi200;
  if (!kospi) return setComment("f1", ht("KRX PER 데이터 확인 중.", "Checking KRX PER data."));
  const currentPer = Number(kospi.per);
  const historicalPer = Number(kospi.historicalAveragePer);
  const forwardPer = HOME_FORWARD_PER;
  const forwardIsLow = Number.isFinite(currentPer) && Number.isFinite(historicalPer) && forwardPer < currentPer && forwardPer < historicalPer;
  const comment = forwardIsLow
    ? ht("Forward PER는 낮지만, 이익 신뢰도와 평균 PER 대비 수준을 함께 봐야 합니다.", "Forward PER is low, but earnings confidence and the historical average still matter.")
    : ht(`현행 ${homeNumber.format(currentPer)}배, 평균 ${homeNumber.format(historicalPer)}배, Forward ${homeNumber.format(forwardPer)}배.`, `Current ${homeNumber.format(currentPer)}x, average ${homeNumber.format(historicalPer)}x, forward ${homeNumber.format(forwardPer)}x.`);
  setComment("f1", `${safeDate(kospi.date)} · ${comment}`);
}

function updateSentimentComment(meta, rows = []) {
  const latest = latestSentiment(rows);
  const view = sentimentView(latest);
  const vkospi = meta?.kospi200Volatility;
  const vkospiText = Number.isFinite(vkospi?.value) ? ` VKOSPI ${homeNumber.format(vkospi.value)}.` : "";
  setComment("f2", `${safeDate(latest?.date || meta?.lastDataDate)} · ${view.label}. ${view.detail}${vkospiText}`);
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
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function capexBurdenLabel(capexToOcf, capexToNi) {
  if (!Number.isFinite(capexToOcf) && !Number.isFinite(capexToNi)) return ht("확인 필요", "Needs data");
  if ((capexToOcf ?? 0) <= 0.7 && (capexToNi ?? 0) <= 0.9) return ht("여유 있음", "Comfortable");
  if ((capexToOcf ?? 0) <= 1.0 && (capexToNi ?? 0) <= 1.2) return ht("관리 가능", "Manageable");
  return ht("부담 확대", "Burden rising");
}

function updateHyperscalerComment(data) {
  const rows = (data?.companies || []).filter((company) => company.group === "Hyperscaler").map((company) => company.quarters?.at(-1)).filter(Boolean);
  if (!rows.length) return setComment("f3", ht("하이퍼스케일러 CAPEX 부담 확인 중.", "Checking hyperscaler CAPEX burden."));
  const avgOcf = averageFinite(rows.map(capexOcf));
  const avgNi = averageFinite(rows.map(capexNi));
  setComment("f3", ht(`CAPEX 부담: ${capexBurdenLabel(avgOcf, avgNi)}. 평균 CAPEX/OCF ${pctText(avgOcf)}, CAPEX/순이익 ${pctText(avgNi)}.`, `CAPEX burden: ${capexBurdenLabel(avgOcf, avgNi)}. Avg CAPEX/OCF ${pctText(avgOcf)}, CAPEX/net income ${pctText(avgNi)}.`));
}

function qoq(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function updateMemoryComment(data) {
  const rows = (data?.companies || [])
    .filter((company) => company.group !== "Hyperscaler")
    .map((company) => {
      const quarters = (company.quarters || []).filter((q) => Number.isFinite(q.quarterlyOperatingIncome));
      const latest = quarters.at(-1);
      const prev = quarters.at(-2);
      return { company, growth: latest && prev ? qoq(latest.quarterlyOperatingIncome, prev.quarterlyOperatingIncome) : null, latest };
    })
    .filter((row) => row.latest);
  const valid = rows.filter((row) => Number.isFinite(row.growth));
  const avgGrowth = averageFinite(valid.map((row) => row.growth));
  const top = [...valid].sort((a, b) => b.growth - a.growth)[0];
  setComment("f4", top
    ? ht(`평균 영업이익 QoQ ${pctText(avgGrowth)}. 증가율 상위: ${top.company.name} ${pctText(top.growth)}.`, `Avg operating-profit QoQ ${pctText(avgGrowth)}. Top growth: ${top.company.name} ${pctText(top.growth)}.`)
    : ht("메모리 업체 영업이익 추이를 확인합니다.", "Checks memory-company operating-profit trends."));
}

function updateLiquidityComment(data) {
  const summary = data?.summary;
  const change = summary?.marketLiquidity?.change;
  if (Number.isFinite(change)) {
    setComment("f5", ht(`최근 3개월 실질 유동성 보조값 ${change >= 0 ? "+" : ""}${homeNumber.format(change)}B USD.`, `Real-liquidity proxy changed ${change >= 0 ? "+" : ""}${homeNumber.format(change)}B USD over 3 months.`));
    return;
  }
  setComment("f5", ht("미국 유동성 방향을 확인합니다.", "Checks U.S. liquidity direction."));
}

function updateAdrComment(data) {
  const premium = Number(data?.result?.premium);
  if (!Number.isFinite(premium)) return setComment("f6", ht("괴리율 확인 중.", "Checking spread."));
  setComment("f6", ht(`괴리율 ${pctText(premium)}`, `Spread ${pctText(premium)}`));
}

async function loadHomeRead() {
  try {
    const [perResult, sentimentResult, sentimentRowsResult, liquidityResult, earningsResult, adrResult] = await Promise.allSettled([
      readJson("/data/market-per.json"),
      readJson("/data/kospi-sentiment-meta.json"),
      readText("/data/kospi-sentiment.csv"),
      readJson("/data/us-liquidity.json"),
      readJson("/data/ai-earnings.json"),
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
    updateHyperscalerComment(earnings);
    updateMemoryComment(earnings);
    updateLiquidityComment(liquidity);
    updateAdrComment(adr);

    const timestamps = [per?.generatedAt, sentiment?.generatedAt, liquidity?.generatedAt, earnings?.generatedAt, adr?.fetchedAt].filter(Boolean);
    if (homeEls.updatedAt) homeEls.updatedAt.textContent = timestamps.length ? `${ht("최근 업데이트", "Last update")} ${timestamps.sort().at(-1)}` : ht("업데이트 정보 없음", "No update information");
  } catch {
    setComment("f1", ht("요약 데이터를 불러오지 못했습니다. 각 페이지에서 개별 지표를 확인해 주세요.", "Could not load the summary. Please open each module page."));
    if (homeEls.updatedAt) homeEls.updatedAt.textContent = ht("데이터 확인 실패", "Data check failed");
  }
}

loadHomeRead();
