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

function main() {
  const market = read("docs/data/market-per.json").markets.kospi200;
  const riskData = read("docs/data/bear-market-risk.json");
  const flow = read("docs/data/foreign-flow-pulse.json");
  const previous = exists(output) ? read(output) : null;
  const perHistory = (market.history || []).map((row) => Number(row.per)).filter(Number.isFinite);
  const percentile = perHistory.filter((value) => value <= Number(market.per)).length / perHistory.length * 100;
  const previousValuation = previous?.regime?.axes?.find((axis) => axis.id === "valuation")?.state ?? null;
  const valuation = valuationState(percentile, previousValuation);
  const score = Number(riskData.summary?.totalScore ?? 0);
  const maxScore = Number(riskData.indicators?.length ?? 5) * RISK.indicatorMax;
  const previousRisk = previous?.regime?.axes?.find((axis) => axis.id === "risk")?.state ?? null;
  const rawRisk = riskStageFor(score, maxScore);
  const risk = riskStageWithHysteresis(rawRisk, previousRisk, previousRisk && rawRisk !== previousRisk ? 0 : (previous?.regime?.axes?.find((axis) => axis.id === "risk")?.lowerWeeks ?? 0) + 1);
  const flowRows = flow.rows || [];
  const flowState = flowRows.length >= FLOW.window ? "ready" : "insufficient";
  const basisDate = [market.date, riskData.lastUpdated, flow.lastDataDate].filter(Boolean).sort().at(-1) || now.slice(0, 10);
  const data = {
    meta: { basisDate, updatedAt: now, source: "WIP Labs connected data pipeline", session: "closed" },
    regime: { axes: [
      { id: "valuation", state: valuation, stateLabel: VALUATION.labels[valuation], value: Number(percentile.toFixed(1)), href: "/valuation/#kospi-per" },
      { id: "risk", state: risk, rawState: rawRisk, stateLabel: RISK.labels[risk], value: score, maxScore, href: "/sentiment-risk/#risk-score" },
      { id: "flow", state: flowState, stateLabel: flowState === "ready" ? "판정 준비" : `수급 이력 ${flowRows.length}/${FLOW.window}`, href: "/market-flow/#flow-5d" },
    ] },
    diff: [],
    inputs: { currentPer: market.per, perPercentile: Number(percentile.toFixed(1)), riskScore: score, riskMaxScore: maxScore, flowHistoryCount: flowRows.length },
  };
  fs.writeFileSync(path.join(root, output), JSON.stringify(data, null, 2) + "\n");
  console.log(`Wrote ${output} for ${basisDate}`);
}
main();
