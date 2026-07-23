/* Validates the generated daily regime snapshot before it is published. */
import fs from "node:fs";
import path from "node:path";
import { RISK, riskStageFor } from "../docs/shared/thresholds.js";

const root = process.cwd();
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const fail = (message) => { throw new Error(`Validation failed: ${message}`); };
const dateValue = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00Z`).getTime();

function main() {
  const state = read("docs/data/daily-state.json");
  const market = read("docs/data/market-per.json").markets?.kospi200;
  const riskData = read("docs/data/bear-market-risk.json");
  const flowData = read("docs/data/foreign-flow-pulse.json");
  const axes = new Map((state.regime?.axes || []).map((axis) => [axis.id, axis]));
  const valuation = axes.get("valuation");
  const risk = axes.get("risk");
  const flow = axes.get("flow");

  if (!state.meta?.basisDate || !valuation || !risk || !flow) fail("daily-state must include basisDate and valuation/risk/flow axes");
  if (!Number.isFinite(Number(state.inputs?.currentPer)) || !Number.isFinite(Number(state.inputs?.perPercentile))) fail("valuation inputs are missing");
  if (!Number.isFinite(Number(risk.value)) || !Number.isFinite(Number(risk.maxScore))) fail("risk inputs are missing");
  if (risk.state !== riskStageFor(Number(risk.value), Number(risk.maxScore)) && risk.rawState !== riskStageFor(Number(risk.value), Number(risk.maxScore))) fail("risk state does not match the shared threshold source");

  const flowInput = state.inputs?.flow || {};
  if (flowInput.count >= flowInput.window) {
    if (flowInput.window !== 10) fail("flow regime must use a 10-session window");
    if (!Array.isArray(flowInput.subjects) || flowInput.subjects.length !== 3) fail("10-session flow state needs all three participant groups");
    const leader = flowInput.subjects.find((subject) => subject.id === flowInput.leaderId);
    if (leader && (leader.state !== "aligned" || leader.sizeRank !== 1)) fail("flow leader must be the largest aligned cumulative flow");
    if (!leader && flowInput.leaderConfidence === "confirmed") fail("confirmed flow leader is missing");
  } else if (flow.state !== "insufficient") {
    fail("flow must remain insufficient until the full window is available");
  }

  const sourceDates = [market?.date, riskData?.lastUpdated, flowData?.lastDataDate].filter(Boolean);
  if (sourceDates.length === 3) {
    const span = Math.max(...sourceDates.map(dateValue)) - Math.min(...sourceDates.map(dateValue));
    if (span > 7 * 24 * 60 * 60 * 1000) fail(`input basis dates are too far apart: ${sourceDates.join(", ")}`);
  }
  if (process.argv.includes("--require-prev") && (valuation.prevState == null || risk.prevState == null || flow.prevState == null)) fail("previous state is required after the initial snapshot");
  console.log(`Validated daily state ${state.meta.basisDate}; inputs: ${sourceDates.join(", ")}`);
}

main();
