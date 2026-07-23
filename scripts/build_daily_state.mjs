/* Build the single daily regime snapshot consumed by the renewed home and detail pages. */
import fs from "node:fs";
import path from "node:path";
import { FLOW, VALUATION, RISK, applyHysteresis, flowThresholds, riskStageFor, riskStageWithHysteresis } from "../docs/shared/thresholds.js";

const root = process.cwd();
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const exists = (file) => fs.existsSync(path.join(root, file));
const output = "docs/data/daily-state.json";
const historyOutput = "docs/data/regime-history.json";
const now = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(" ", "T") + "+09:00";
const FLOW_WINDOW = FLOW.window;
const FLOW_SHORT_WINDOW = FLOW.shortWindow;

function valuationState(percentile, previous) {
  const candidate = percentile < VALUATION.enter.low ? "low" : percentile > VALUATION.enter.high ? "high" : "mid";
  return applyHysteresis(previous, candidate, (state) => (state === "low" ? percentile < VALUATION.exit.low : state === "high" ? percentile > VALUATION.exit.high : percentile >= VALUATION.enter.low && percentile <= VALUATION.enter.high));
}

function csvRows(file) {
  const [header, ...lines] = fs.readFileSync(path.join(root, file), "utf8").trim().split(/\r?\n/);
  const columns = header.split(",");
  return lines.map((line) => Object.fromEntries(columns.map((column, index) => [column, line.split(",")[index]])));
}

function flowSummary(rows) {
  const closes = new Map(csvRows("docs/data/kospi-per-history.csv").map((row) => [row.date, Number(row.close)]));
  const usable = rows.filter((row) => Number.isFinite(closes.get(row.date))).sort((a, b) => a.date.localeCompare(b.date));
  if (usable.length < FLOW_WINDOW) return { state: "insufficient", label: `수급 이력 ${usable.length}/${FLOW_WINDOW}`, count: usable.length, window: FLOW_WINDOW, shortWindow: FLOW_SHORT_WINDOW };
  const sample = usable.slice(-FLOW_WINDOW);
  const shortSample = usable.slice(-FLOW_SHORT_WINDOW);
  const indexReturn = closes.get(sample.at(-1).date) / closes.get(sample[0].date) - 1;
  const shortIndexReturn = closes.get(shortSample.at(-1).date) / closes.get(shortSample[0].date) - 1;
  const thresholds = flowThresholds(sample.length);
  const dailyDirections = sample.map((row, index) => {
    if (!index) return null;
    const returnPct = closes.get(row.date) / closes.get(sample[index - 1].date) - 1;
    return Math.abs(returnPct) >= FLOW.flatReturnPct / 100 ? Math.sign(returnPct) : null;
  });
  const subjects = [["foreignSpot", "외국인"], ["individualSpot", "개인"], ["institutionSpot", "기관"]].map(([id, name]) => {
    const cumulative = sample.reduce((total, row) => total + Number(row[id] || 0), 0);
    const shortCumulative = shortSample.reduce((total, row) => total + Number(row[id] || 0), 0);
    const comparable = sample.slice(1).filter((row, index) => dailyDirections[index + 1] && Number(row[id] || 0) !== 0);
    const matches = comparable.filter((row) => Math.sign(Number(row[id] || 0)) === dailyDirections[sample.indexOf(row)]).length;
    const matchRate = comparable.length ? matches / comparable.length * 100 : null;
    const state = matchRate == null ? "unrelated" : matchRate >= thresholds.enter.aligned ? "aligned" : matchRate <= thresholds.enter.contrarian ? "contrarian" : "unrelated";
    const shortTrend = cumulative === 0 || shortCumulative === 0
      ? "flat"
      : Math.sign(cumulative) === Math.sign(shortCumulative) ? "continuing" : "turning";
    return { id, name, cumulative: Number(cumulative.toFixed(6)), shortCumulative: Number(shortCumulative.toFixed(6)), shortTrend, state, matchRate: matchRate == null ? null : Number(matchRate.toFixed(1)), comparableDays: comparable.length, size: Math.abs(cumulative) };
  });
  const ranked = subjects.slice().sort((a, b) => b.size - a.size).map((subject, index) => ({ ...subject, sizeRank: index + 1 }));
  const aligned = ranked.filter((subject) => subject.state === "aligned");
  const leader = aligned.length === FLOW.leader.maxAlignedSubjects && aligned[0].sizeRank <= FLOW.leader.sizeRankWithin ? aligned[0] : null;
  const largestSeller = ranked.filter((subject) => subject.cumulative < 0).sort((a, b) => a.cumulative - b.cumulative)[0] || null;
  return {
    state: leader ? "aligned" : "unrelated",
    label: leader ? `${leader.name} 수급 동행` : "수급과 지수 방향 혼재",
    count: sample.length,
    window: FLOW_WINDOW,
    shortWindow: FLOW_SHORT_WINDOW,
    thresholds,
    indexReturn: Number(indexReturn.toFixed(4)),
    shortIndexReturn: Number(shortIndexReturn.toFixed(4)),
    subjects: ranked,
    leaderId: leader?.id ?? null,
    leaderConfidence: leader ? "confirmed" : "unclear",
    largestSellerId: largestSeller?.id ?? null,
    ruleVersion: "match-rate-v1",
  };
}

function earningsSummary(data) {
  const companies = data?.companies || [];
  const hyperscalers = companies.filter((company) => company.group === "Hyperscaler");
  const capexRatios = hyperscalers.map((company) => (company.quarters || []).slice(-2).map((quarter) => Math.abs(Number(quarter.capex)) / Number(quarter.operatingCashFlow))).flat().filter(Number.isFinite);
  const avgCapexOcf = capexRatios.length ? capexRatios.reduce((sum, value) => sum + value, 0) / capexRatios.length : null;
  const strained = hyperscalers.some((company) => (company.quarters || []).slice(-2).every((quarter) => Math.abs(Number(quarter.capex)) > Number(quarter.operatingCashFlow)));
  const capexState = strained ? "strained" : avgCapexOcf >= 0.7 ? "elevated" : "normal";
  const memory = companies.filter((company) => company.group !== "Hyperscaler" && company.id !== "kioxia");
  const growth = memory.map((company) => {
    const rows = (company.quarters || []).slice(-2);
    if (rows.length < 2 || !Number(rows[0].quarterlyOperatingIncome)) return null;
    return (Number(rows[1].quarterlyOperatingIncome) / Math.abs(Number(rows[0].quarterlyOperatingIncome))) - 1;
  }).filter(Number.isFinite);
  const averageGrowth = growth.length ? growth.reduce((sum, value) => sum + value, 0) / growth.length : null;
  return { capex: { state: capexState, avgCapexOcf, companies: hyperscalers.length }, memory: { state: averageGrowth > 0 ? "expanding" : averageGrowth < 0 ? "contracting" : "flat", averageOperatingIncomeGrowth: averageGrowth, companies: memory.length } };
}

function main() {
  const market = read("docs/data/market-per.json").markets.kospi200;
  const riskData = read("docs/data/bear-market-risk.json");
  const flow = read("docs/data/foreign-flow-pulse.json");
  const earnings = read("docs/data/ai-earnings.json");
  const previous = exists(output) ? read(output) : null;
  const perHistory = (market.history || []).map((row) => Number(row.per)).filter(Number.isFinite);
  const percentile = perHistory.filter((value) => value <= Number(market.per)).length / perHistory.length * 100;
  const previousValuation = previous?.regime?.axes?.find((axis) => axis.id === "valuation")?.state ?? null;
  const valuation = valuationState(percentile, previousValuation);
  const score = Number(riskData.summary?.totalScore ?? 0);
  const maxScore = Number(riskData.indicators?.length ?? 5) * RISK.indicatorMax;
  const previousRisk = previous?.regime?.axes?.find((axis) => axis.id === "risk")?.state ?? null;
  const rawRisk = riskStageFor(score, maxScore);
  const previousRiskAxis = previous?.regime?.axes?.find((axis) => axis.id === "risk");
  const rawRiskRank = RISK.stages.indexOf(rawRisk);
  const previousRiskRank = RISK.stages.indexOf(previousRisk);
  const lowerWeeks = previousRisk && rawRiskRank < previousRiskRank ? (previousRiskAxis?.lowerWeeks ?? 0) + 1 : 0;
  const risk = riskStageWithHysteresis(rawRisk, previousRisk, lowerWeeks);
  const flowResult = flowSummary(flow.rows || []);
  const earningsResult = earningsSummary(earnings);
  const basisDate = [market.date, riskData.lastUpdated, flow.lastDataDate].filter(Boolean).sort().at(-1) || now.slice(0, 10);
  const data = {
    meta: {
      basisDate,
      inputDates: { valuation: market.date, risk: riskData.lastUpdated, flow: flow.lastDataDate, capex: earnings.generatedAt?.slice(0, 10), memory: earnings.generatedAt?.slice(0, 10) },
      updatedAt: now,
      source: "WIP Labs connected data pipeline",
      session: "closed",
    },
    regime: { axes: [
      { id: "valuation", state: valuation, prevState: previousValuation, stateLabel: VALUATION.labels[valuation], value: Number(percentile.toFixed(1)), href: "/valuation/#kospi-per" },
      { id: "risk", state: risk, prevState: previousRisk, rawState: rawRisk, lowerWeeks, stateLabel: RISK.labels[risk], value: score, maxScore, href: "/sentiment-risk/#risk-score" },
      { id: "flow", state: flowResult.state, prevState: previous?.regime?.axes?.find((axis) => axis.id === "flow")?.state ?? null, stateLabel: flowResult.label, href: "/market-flow/#flow-5d" },
      { id: "capex", state: earningsResult.capex.state, prevState: previous?.regime?.axes?.find((axis) => axis.id === "capex")?.state ?? null, stateLabel: earningsResult.capex.state === "strained" ? "투자 부담" : earningsResult.capex.state === "elevated" ? "투자 확대" : "투자 여력", href: "/ai-capex/" },
      { id: "memory", state: earningsResult.memory.state, prevState: previous?.regime?.axes?.find((axis) => axis.id === "memory")?.state ?? null, stateLabel: earningsResult.memory.state === "expanding" ? "실적 확장" : earningsResult.memory.state === "contracting" ? "실적 둔화" : "실적 보합", href: "/memory-earnings/" },
    ] },
    diff: [],
    inputs: { currentPer: market.per, perPercentile: Number(percentile.toFixed(1)), riskScore: score, riskMaxScore: maxScore, flow: flowResult, earnings: earningsResult },
  };
  data.diff = data.regime.axes
    .filter((axis) => axis.prevState && axis.prevState !== axis.state)
    .map((axis) => ({ id: axis.id, type: "state-change", from: axis.prevState, to: axis.state, href: axis.href }));
  fs.writeFileSync(path.join(root, output), JSON.stringify(data, null, 2) + "\n");
  const priorHistory = exists(historyOutput) ? read(historyOutput) : { snapshots: [] };
  const snapshot = {
    date: data.meta.basisDate,
    updatedAt: data.meta.updatedAt,
    labelKo: data.regime.axes.map((axis) => axis.stateLabel).join(" · "),
    labelEn: data.regime.axes.map((axis) => `${axis.id}: ${axis.state}`).join(" · "),
    axes: data.regime.axes.map(({ id, state, stateLabel }) => ({ id, state, stateLabel })),
    diff: data.diff,
  };
  const snapshots = [...(priorHistory.snapshots || []).filter((row) => row.date !== snapshot.date), snapshot]
    .sort((a, b) => a.date.localeCompare(b.date)).slice(-366);
  fs.writeFileSync(path.join(root, historyOutput), JSON.stringify({ generatedAt: now, snapshots }, null, 2) + "\n");
  console.log(`Wrote ${output} for ${basisDate}`);
}
main();
