const homeEls = {
  updatedAt: document.querySelector("#homeUpdatedAt"),
  marketSentimentLabel: document.querySelector("#marketSentimentLabel"),
  marketSentimentSummary: document.querySelector("#marketSentimentSummary"),
  comments: {
    f1: document.querySelector("#commentF1"),
    f2: document.querySelector("#commentF2"),
    f3: document.querySelector("#commentF3"),
    f4: document.querySelector("#commentF4"),
    f5: document.querySelector("#commentF5"),
    f6: document.querySelector("#commentF6"),
    f7: document.querySelector("#commentF7"),
    f8: document.querySelector("#commentF8"),
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

function formatHomeUpdatedAt(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat(IS_EN ? "en-US" : "ko-KR", {
    year: "numeric",
    month: IS_EN ? "short" : "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: IS_EN,
    timeZone: "Asia/Seoul",
  }).format(date);
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
  const stock = data?.stockSignals?.hyperscalers;
  const stockLabel = IS_EN ? stock?.labelEn : stock?.labelKo;
  const stockText = Number.isFinite(stock?.averageReturn3m) ? ht(` 주가 흐름: ${stockLabel} (${pctText(stock.averageReturn3m)}).`, ` Share-price trend: ${stockLabel} (${pctText(stock.averageReturn3m)}).`) : "";
  setComment("f3", `${ht(`CAPEX 부담: ${capexBurdenLabel(avgOcf, avgNi)}. 평균 CAPEX/OCF ${pctText(avgOcf)}, CAPEX/순이익 ${pctText(avgNi)}.`, `CAPEX burden: ${capexBurdenLabel(avgOcf, avgNi)}. Avg CAPEX/OCF ${pctText(avgOcf)}, CAPEX/net income ${pctText(avgNi)}.`)}${stockText}`);
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
  const stock = data?.stockSignals?.memory;
  const stockLabel = IS_EN ? stock?.labelEn : stock?.labelKo;
  const stockText = Number.isFinite(stock?.averageReturn3m) ? ht(` 주가 흐름: ${stockLabel} (${pctText(stock.averageReturn3m)}).`, ` Share-price trend: ${stockLabel} (${pctText(stock.averageReturn3m)}).`) : "";
  setComment("f4", top
    ? `${ht(`평균 영업이익 QoQ ${pctText(avgGrowth)}. 증가율 상위: ${top.company.name} ${pctText(top.growth)}.`, `Avg operating-profit QoQ ${pctText(avgGrowth)}. Top growth: ${top.company.name} ${pctText(top.growth)}.`)}${stockText}`
    : ht("메모리 업체 영업이익 추이를 확인합니다.", "Checks memory-company operating-profit trends."));
}

function updateLiquidityComment(data) {
  const summary = data?.summary;
  const change = summary?.marketLiquidity?.change;
  if (!summary) return setComment("f5", ht("미국 유동성 방향을 확인합니다.", "Checks U.S. liquidity direction."));
  const label = summary.tone === "positive"
    ? ht("우호적", "Supportive")
    : summary.tone === "negative"
      ? ht("비우호적", "Restrictive")
      : ht("중립·혼재", "Neutral/mixed");
  const countText = Number.isFinite(summary.positives) && Number.isFinite(summary.total)
    ? ht(`${summary.total}개 중 ${summary.positives}개 지표가 우호 방향`, `${summary.positives} of ${summary.total} indicators are supportive`)
    : ht("세부 지표 방향이 혼재", "the component signals are mixed");
  const changeText = Number.isFinite(change)
    ? ht(`실질 유동성 보조값은 최근 3개월 ${change >= 0 ? "+" : ""}${homeNumber.format(change)}십억 달러`, `the real-liquidity proxy changed ${change >= 0 ? "+" : ""}${homeNumber.format(change)}B USD over three months`)
    : ht("실질 유동성 변화는 확인 필요", "the real-liquidity change needs confirmation");
  setComment("f5", `${label}. ${countText}${ht("이며 ", "; ")}${changeText}.`);
}

function updateMemoryPriceComment(data) {
  const stock = data?.stockSignals?.memoryAll;
  const label = IS_EN ? stock?.labelEn : stock?.labelKo;
  if (!Number.isFinite(stock?.averageReturn3m)) return setComment("f6", ht("메모리 업체 주가 흐름 확인 중.", "Checking memory share-price trend."));
  setComment("f6", ht(`최근 3개월 평균 ${pctText(stock.averageReturn3m)} · ${label} (${stock.positiveCount}/${stock.total} 상승)`, `Average 3M ${pctText(stock.averageReturn3m)} · ${label} (${stock.positiveCount}/${stock.total} up)`));
}

function scoreTextHome(value) {
  return Number.isFinite(value) ? `${homeNumber.format(value)}/10` : "N/A";
}

function riskStage(score, scale = []) {
  return scale.find((item) => score >= item.min && score <= item.max) || null;
}

function updateBearRiskComment(data) {
  const score = Number(data?.summary?.totalScore);
  if (!Number.isFinite(score)) return setComment("f7", ht("약세장 위험 점수를 확인합니다.", "Checks bear-market transition risk."));
  const stage = riskStage(score, data?.scoreScale);
  const label = stage ? (IS_EN ? stage.labelEn : stage.labelKo) : ht("확인 필요", "Needs data");
  const sample = data?.sample ? ht("샘플", "sample") : ht("실데이터", "live data");
  setComment("f7", ht(`현재 ${scoreTextHome(score)}, ${label} 단계입니다. (${sample})`, `Current score ${scoreTextHome(score)}, ${label} stage. (${sample})`));
}

function updateForeignFlowComment(data) {
  const rows = Array.isArray(data?.rows)
    ? data.rows.filter((row) => row?.date).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-5)
    : [];
  if (!rows.length) {
    setComment("f8", ht("수급 판정 데이터 확인 중.", "Checking flow-stage data."));
    return null;
  }

  const spotTotal = rows.reduce((sum, row) => sum + Number(row.spot || 0), 0);
  const futuresTotal = rows.reduce((sum, row) => sum + Number(row.futures || 0), 0);
  const spotBuyDays = rows.filter((row) => Number(row.spot) > 0).length;
  const futuresBuyDays = rows.filter((row) => Number(row.futures) > 0).length;
  const jointBuyDays = rows.filter((row) => Number(row.spot) > 0 && Number(row.futures) > 0).length;
  const riskOffDays = rows.filter((row) => Number(row.spot) <= 0 && Number(row.futures) <= 0).length;
  const recentJointDays = rows.slice(-3).filter((row) => Number(row.spot) > 0 && Number(row.futures) > 0).length;

  let stageIndex;
  if (rows.length >= 5 && spotTotal > 0 && futuresTotal > 0 && jointBuyDays >= 4 && spotBuyDays >= 4 && futuresBuyDays >= 4 && recentJointDays === 3) stageIndex = 4;
  else if (rows.length >= 3 && spotTotal > 0 && futuresTotal > 0 && jointBuyDays >= 3 && recentJointDays >= 2) stageIndex = 3;
  else if (futuresTotal > 0 && (spotTotal > 0 || spotBuyDays >= 2)) stageIndex = 2;
  else if (futuresTotal > 0 && spotTotal <= 0) stageIndex = 1;
  else if ((spotTotal < 0 && futuresTotal < 0) || riskOffDays >= Math.max(2, Math.ceil(rows.length * 0.6))) stageIndex = 0;
  else stageIndex = 2;

  const labelsKo = ["하락 우세", "단기 반등", "바닥 다지기", "매집 전환", "상승 추세 강화"];
  const labelsEn = ["Decline dominant", "Short-term rebound", "Bottom building", "Accumulation turn", "Uptrend strengthening"];
  const label = (IS_EN ? labelsEn : labelsKo)[stageIndex];
  const provisional = rows.length < 5 ? ht(" · 잠정", " · provisional") : "";
  const signed = (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
  setComment("f8", ht(
    `${safeDate(data.lastDataDate || rows.at(-1).date)} · ${label}${provisional}. 현물 ${signed(spotTotal)}조원, 선물 ${signed(futuresTotal)}조원 (${rows.length}/5일).`,
    `${safeDate(data.lastDataDate || rows.at(-1).date)} · ${label}${provisional}. Spot ${signed(spotTotal)}T KRW, futures ${signed(futuresTotal)}T KRW (${rows.length}/5 sessions).`
  ));
  return { rows, spotTotal, futuresTotal, stageIndex, label, provisional: rows.length < 5 };
}

function updateMarketSentiment(per, sentiment, sentimentRows, earnings, bearRisk, flowSummary) {
  const kospi = per?.markets?.kospi200;
  const currentPer = Number(kospi?.per);
  const averagePer = Number(kospi?.historicalAveragePer);
  const valuationGap = Number.isFinite(currentPer) && Number.isFinite(averagePer) && averagePer !== 0
    ? currentPer / averagePer - 1
    : null;
  const retailPoint = latestSentiment(sentimentRows);
  const retailView = sentimentView(retailPoint);
  const vkospi = Number(sentiment?.kospi200Volatility?.value);
  const vkospiDailyMove = Number.isFinite(vkospi) ? vkospi / Math.sqrt(252) : null;
  const dualValuationSignal = Number.isFinite(currentPer)
    && Number.isFinite(averagePer)
    && currentPer > averagePer
    && HOME_FORWARD_PER < currentPer
    && HOME_FORWARD_PER < averagePer;

  const hyperscalerRows = (earnings?.companies || [])
    .filter((company) => company.group === "Hyperscaler")
    .map((company) => company.quarters?.at(-1))
    .filter(Boolean);
  const avgCapexOcf = averageFinite(hyperscalerRows.map(capexOcf));
  const avgCapexNi = averageFinite(hyperscalerRows.map(capexNi));
  const capexLabel = capexBurdenLabel(avgCapexOcf, avgCapexNi);

  const memoryGrowthRows = (earnings?.companies || [])
    .filter((company) => company.group !== "Hyperscaler" && company.name !== "Kioxia")
    .map((company) => {
      const quarters = (company.quarters || []).filter((quarter) => Number.isFinite(quarter.quarterlyOperatingIncome));
      const latest = quarters.at(-1);
      const previous = quarters.at(-2);
      return latest && previous ? qoq(latest.quarterlyOperatingIncome, previous.quarterlyOperatingIncome) : null;
    })
    .filter(Number.isFinite);
  const avgMemoryGrowth = averageFinite(memoryGrowthRows);
  const hyperscalerStock = earnings?.stockSignals?.hyperscalers;
  const memoryStock = earnings?.stockSignals?.memory;

  const riskScore = Number(bearRisk?.summary?.totalScore);
  const risk = riskStage(riskScore, bearRisk?.scoreScale || []);
  const riskLabel = risk ? (IS_EN ? risk.labelEn : risk.labelKo) : ht("확인 필요", "Needs data");

  let score = 0;
  if (Number.isFinite(valuationGap)) score += valuationGap > 0.1 ? -1 : valuationGap < -0.1 ? 0.75 : 0;
  if (dualValuationSignal) score += 0.5;
  if (capexLabel === ht("여유 있음", "Comfortable")) score += 0.5;
  else if (capexLabel === ht("부담 확대", "Burden rising")) score -= 0.5;
  if (Number.isFinite(avgMemoryGrowth)) score += avgMemoryGrowth > 0.1 ? 1 : avgMemoryGrowth < -0.1 ? -1 : 0;
  if (Number.isFinite(riskScore)) score += riskScore <= 4 ? 0.25 : riskScore >= 6.5 ? -1 : -0.5;
  if (Number.isFinite(vkospi)) score += vkospi >= 40 ? -1 : vkospi >= 25 ? -0.5 : 0;
  if (hyperscalerStock?.status === "favorable" && memoryStock?.status === "favorable") score += 0.5;
  else if (hyperscalerStock?.status === "unfavorable" || memoryStock?.status === "unfavorable") score -= 0.5;
  if (flowSummary) {
    const flowScores = [-1, -0.5, 0, 0.5, 1];
    score += flowScores[flowSummary.stageIndex] * (flowSummary.provisional ? 0.5 : 1);
  }

  let label;
  let tone;
  let lead;
  if (dualValuationSignal && vkospi >= 40) {
    label = ht("방향성 혼재·고변동성", "Mixed direction/high volatility");
    tone = "neutral";
    lead = ht("한국 주식시장은 상방과 하방 재료가 동시에 존재하고, 예상 변동 폭도 큰 구간입니다.", "Korean equities have both upside and downside catalysts while expected volatility remains elevated.");
  } else if (score >= 2) {
    label = ht("긍정 우세", "Positive");
    tone = "positive";
    lead = ht("한국 주식시장 센티멘트는 긍정 신호가 우세합니다.", "Korean equity sentiment is tilted positive.");
  } else if (score >= 0.5) {
    label = ht("중립 속 개선", "Neutral, improving");
    tone = "positive";
    lead = ht("한국 주식시장 센티멘트는 중립권에서 개선을 시도하는 모습입니다.", "Korean equity sentiment is attempting to improve from neutral territory.");
  } else if (score > -0.5) {
    label = ht("중립", "Neutral");
    tone = "neutral";
    lead = ht("한국 주식시장 센티멘트는 긍정과 경계 신호가 맞서는 중립 구간입니다.", "Korean equity sentiment is neutral, with supportive and cautionary signals offsetting each other.");
  } else if (score > -2) {
    label = ht("신중", "Cautious");
    tone = "negative";
    lead = ht("한국 주식시장 센티멘트는 반등 가능성보다 확인이 더 필요한 신중 구간입니다.", "Korean equity sentiment remains cautious and needs more confirmation before a rebound can be trusted.");
  } else {
    label = ht("위험 회피", "Risk-off");
    tone = "negative";
    lead = ht("한국 주식시장 센티멘트는 위험 회피 신호가 우세합니다.", "Korean equity sentiment is dominated by risk-off signals.");
  }

  const sentences = [lead];
  if (Number.isFinite(valuationGap)) {
    sentences.push(ht(
      `KOSPI 현행 PER ${homeNumber.format(currentPer)}배는 역사적 평균 ${homeNumber.format(averagePer)}배보다 ${Math.abs(valuationGap * 100).toFixed(1)}% ${valuationGap >= 0 ? "높아 현재 이익 기준 하방 부담이 있지만" : "낮아 현재 이익 기준 부담이 완화되어 있고"}, Forward PER ${homeNumber.format(HOME_FORWARD_PER)}배는 예상이익이 실현될 경우 상당한 상방 여지를 시사합니다.`,
      `The KOSPI current PER of ${homeNumber.format(currentPer)}x is ${Math.abs(valuationGap * 100).toFixed(1)}% ${valuationGap >= 0 ? "above" : "below"} its ${homeNumber.format(averagePer)}x historical average, ${valuationGap >= 0 ? "implying downside valuation pressure on current earnings" : "reducing valuation pressure on current earnings"}; the ${homeNumber.format(HOME_FORWARD_PER)}x forward PER implies substantial upside if forecast earnings materialize.`
    ));
  }
  if (Number.isFinite(vkospiDailyMove)) {
    sentences.push(ht(
      `반대로 예상이익에 대한 신뢰가 약해지면 낮은 Forward PER가 할인 이유가 될 수 있고, VKOSPI ${homeNumber.format(vkospi)}는 거래일 기준 일간 약 ±${vkospiDailyMove.toFixed(1)}% 변동 가능성을 반영해 방향보다 변동 폭 확대를 경고합니다.`,
      `If confidence in forecast earnings weakens, the low forward PER may instead reflect a discount; VKOSPI at ${homeNumber.format(vkospi)} translates to roughly ±${vkospiDailyMove.toFixed(1)}% expected daily movement, warning about magnitude rather than direction.`
    ));
  }
  if (hyperscalerStock?.status && memoryStock?.status) {
    const hyperLabel = IS_EN ? hyperscalerStock.labelEn : hyperscalerStock.labelKo;
    const memoryLabel = IS_EN ? memoryStock.labelEn : memoryStock.labelKo;
    sentences.push(ht(
      `하이퍼스케일러 주가 흐름은 ${hyperLabel}, 메모리 업체 주가 흐름은 ${memoryLabel}입니다. 두 흐름은 AI 투자와 메모리 업황 기대를 통해 한국 기술주 센티멘트의 보조 재료로 반영했습니다.`,
      `Hyperscaler share-price trends are ${hyperLabel}; memory-company trends are ${memoryLabel}. Both are included as supporting inputs for Korean technology sentiment through AI investment and memory-cycle expectations.`
    ));
  }
  if (Number.isFinite(riskScore)) {
    sentences.push(ht(
      "약세장으로의 전환 위험은 아직 즉각적이지 않으며, 주요 트리거 요소들의 변화를 계속 관찰해야 하는 상황입니다.",
      "The risk of a bear-market transition is not immediate, but the main trigger conditions still warrant continued monitoring."
    ));
  }
  if (flowSummary) {
    sentences.push(ht(
      `개인 수급은 ${retailView.label}, 외국인 현물·선물 수급은 ${flowSummary.label}${flowSummary.provisional ? "(잠정)" : ""} 단계이며, 메모리 영업이익 흐름과 하이퍼스케일러 CAPEX 부담(${capexLabel})까지 함께 보면 아직 한 방향으로 확신하기 어렵습니다.`,
      `Retail flow reads ${retailView.label}, foreign spot/futures flow is ${flowSummary.label}${flowSummary.provisional ? " (provisional)" : ""}, and memory earnings versus hyperscaler CAPEX pressure (${capexLabel}) still do not support a one-way conclusion.`
    ));
  }
  if (homeEls.marketSentimentLabel) {
    homeEls.marketSentimentLabel.textContent = label;
    homeEls.marketSentimentLabel.dataset.tone = tone;
  }
  if (homeEls.marketSentimentSummary) {
    const paragraphs = sentences.slice(0, 5).map((sentence) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = sentence;
      return paragraph;
    });
    homeEls.marketSentimentSummary.replaceChildren(...paragraphs);
  }
}

async function loadHomeRead() {
  try {
    const [perResult, sentimentResult, sentimentRowsResult, liquidityResult, earningsResult, bearRiskResult, foreignFlowResult] = await Promise.allSettled([
      readJson("/data/market-per.json"),
      readJson("/data/kospi-sentiment-meta.json"),
      readText("/data/kospi-sentiment.csv"),
      readJson("/data/us-liquidity.json"),
      readJson("/data/ai-earnings.json"),
      readJson("/data/bear-market-risk.json"),
      readJson("/data/foreign-flow-pulse.json"),
    ]);
    const per = perResult.status === "fulfilled" ? perResult.value : null;
    const sentiment = sentimentResult.status === "fulfilled" ? sentimentResult.value : null;
    const sentimentRows = sentimentRowsResult.status === "fulfilled" ? parseSentimentCsv(sentimentRowsResult.value) : [];
    const liquidity = liquidityResult.status === "fulfilled" ? liquidityResult.value : null;
    const earnings = earningsResult.status === "fulfilled" ? earningsResult.value : null;
    const bearRisk = bearRiskResult.status === "fulfilled" ? bearRiskResult.value : null;
    const foreignFlow = foreignFlowResult.status === "fulfilled" ? foreignFlowResult.value : null;

    updatePerComment(per);
    updateSentimentComment(sentiment, sentimentRows);
    updateHyperscalerComment(earnings);
    updateMemoryComment(earnings);
    updateLiquidityComment(liquidity);
    updateMemoryPriceComment(earnings);
    updateBearRiskComment(bearRisk);
    const flowSummary = updateForeignFlowComment(foreignFlow);
    updateMarketSentiment(per, sentiment, sentimentRows, earnings, bearRisk, flowSummary);

    const timestamps = [per?.generatedAt, sentiment?.generatedAt, liquidity?.generatedAt, earnings?.generatedAt, adr?.fetchedAt, bearRisk?.generatedAt, foreignFlow?.generatedAt].filter(Boolean);
    if (homeEls.updatedAt) homeEls.updatedAt.textContent = timestamps.length ? `${ht("최근 업데이트", "Last update")} ${formatHomeUpdatedAt(timestamps.sort().at(-1))}` : ht("업데이트 정보 없음", "No update information");
  } catch {
    setComment("f1", ht("요약 데이터를 불러오지 못했습니다. 각 페이지에서 개별 지표를 확인해 주세요.", "Could not load the summary. Please open each module page."));
    if (homeEls.updatedAt) homeEls.updatedAt.textContent = ht("데이터 확인 실패", "Data check failed");
  }
}

loadHomeRead();
