/* Build the single daily regime snapshot consumed by the renewed home and detail pages. */
import fs from "node:fs";
import path from "node:path";
import { VALUATION, FLOW, RISK, applyHysteresis, riskStageFor, riskStageWithHysteresis } from "../docs/shared/thresholds.js";

const root = process.cwd();
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const exists = (file) => fs.existsSync(path.join(root, file));
const output = "docs/data/daily-state.json";
const now = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(" ", "T") + "+09:00";

function valuationState(percentile, previous) {
  const candidate = percentile < VALUATION.enter.low ? "low" : percentile > VALUATION.enter.high ? "high" : "mid";
  return applyHysteresis(previous, candidate, (state) => (state === "low" ? percentile < VALUATION.exit.low : state === "high" ? percentile > VALUATION.exit.high : percentile >= VALUATION.enter.low && percentile <= VALUATION.enter.high));
}

function csvRows(file) {
  const [header, ...lines] = fs.readFileSync(path.join(root, file), "utf8").trim().split(/\r?\n/);
  const columns = header.split(",");
  return lines.map((line) => Object.fromEntries(columns.map((column, index) => [column, line.split(",")[index]])));
}

function flowSummary(rows, previousFlow = null) {
  const closes = new Map(csvRows("docs/data/kospi-per-history.csv").map((row) => [row.date, Number(row.close)]));
  const usable = rows.filter((row) => Number.isFinite(closes.get(row.date))).sort((a, b) => a.date.localeCompare(b.date));
  if (usable.length < FLOW.window) return { state: "insufficient", label: `수급 이력 ${usable.length}/${FLOW.window}`, count: usable.length };
  const sample = usable.slice(-FLOW.window);
  const previousSubjects = new Map((previousFlow?.subjects || []).map((subject) => [subject.id, subject]));
  const subjects = [["foreignSpot", "외국인"], ["individualSpot", "개인"], ["institutionSpot", "기관"]].map(([id, name]) => {
    let matches = 0, observations = 0;
    for (let index = 1; index < sample.length; index += 1) {
      const change = (closes.get(sample[index].date) / closes.get(sample[index - 1].date) - 1) * 100;
      if (Math.abs(change) < FLOW.flatReturnPct) continue;
      observations += 1;
      if (Math.sign(Number(sample[index][id])) === Math.sign(change)) matches += 1;
    }
    const matchRate = observations ? matches / observations * 100 : 50;
    const prior = previousSubjects.get(id)?.state;
    const remainsAligned = prior === "aligned" && matchRate >= FLOW.exit.aligned;
    const remainsContrarian = prior === "contrarian" && matchRate <= FLOW.exit.contrarian;
    const state = remainsAligned || matchRate >= FLOW.enter.aligned
      ? "aligned"
      : remainsContrarian || matchRate <= FLOW.enter.contrarian
        ? "contrarian"
        : "unrelated";
    const size = sample.map((row) => Math.abs(Number(row[id]))).sort((a, b) => a - b)[Math.floor(sample.length / 2)];
    return { id, name, matchRate: Number(matchRate.toFixed(1)), state, size };
  });
  const ranked = subjects.slice().sort((a, b) => b.size - a.size).map((subject, index) => ({ ...subject, sizeRank: index + 1 }));
  const aligned = ranked.filter((subject) => subject.state === "aligned");
  const leader = aligned.length === FLOW.leader.maxAlignedSubjects && aligned[0].sizeRank <= FLOW.leader.sizeRankWithin ? aligned[0] : null;
  return { state: leader ? "aligned" : "unrelated", label: leader ? `${leader.name} 동행 · 규모 상위` : "방향 주도 불명", count: sample.length, subjects: ranked, leaderId: leader?.id ?? null, leaderConfidence: leader ? "confirmed" : "unclear" };
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
  const flowResult = flowSummary(flow.rows || [], previous?.inputs?.flow);
  const earningsResult = earningsSummary(earnings);
  const basisDate = [market.date, riskData.lastUpdated, flow.lastDataDate].filter(Boolean).sort().at(-1) || now.slice(0, 10);
  const data = {
    meta: { basisDate, updatedAt: now, source: "WIP Labs connected data pipeline", session: "closed" },
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
  console.log(`Wrote ${output} for ${basisDate}`);
}
main();
