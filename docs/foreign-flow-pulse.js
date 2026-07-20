const FLOW_STORAGE_KEY = "wiplabs-foreign-flow-pulse";
const FLOW_IS_EN = document.documentElement.lang?.toLowerCase().startsWith("en");
const FLOW_EXAMPLE_ROWS = [
  { id: "2026-07-13", date: "2026-07-13", spot: -1.6, futures: 1.3 },
  { id: "2026-07-14", date: "2026-07-14", spot: 1.0, futures: 1.6 },
  { id: "2026-07-15", date: "2026-07-15", spot: 2.3, futures: -1.7 },
  { id: "2026-07-16", date: "2026-07-16", spot: -1.4, futures: 0.7 },
  { id: "2026-07-17", date: "2026-07-17", spot: 0.5, futures: 1.0 },
];

const flowEls = {
  stage: document.querySelector("#flowStage"),
  stageNote: document.querySelector("#flowStageNote"),
  stageTrack: document.querySelector("#flowStageTrack"),
  spotTotal: document.querySelector("#flowSpotTotal"),
  futuresTotal: document.querySelector("#flowFuturesTotal"),
  spotDays: document.querySelector("#flowSpotDays"),
  futuresDays: document.querySelector("#flowFuturesDays"),
  jointDays: document.querySelector("#flowJointDays"),
  window: document.querySelector("#flowWindow"),
  commentary: document.querySelector("#flowCommentary"),
  tableBody: document.querySelector("#flowTableBody"),
  add: document.querySelector("#flowAdd"),
  reset: document.querySelector("#flowReset"),
};

const flowText = {
  stages: FLOW_IS_EN
    ? ["Sell-off", "Short cover", "Bottom search", "Accumulation turn", "Trend strengthening"]
    : ["매도", "숏커버", "바닥 탐색", "매집 전환", "추세 강화"],
  patterns: {
    joint: FLOW_IS_EN ? "Joint buying" : "동반 매수",
    cover: FLOW_IS_EN ? "Futures-led rebound / short cover" : "선행 반등·숏커버",
    hedge: FLOW_IS_EN ? "Arbitrage / hedge possibility" : "차익거래·헤지 가능성",
    risk: FLOW_IS_EN ? "Risk-off" : "위험 회피",
  },
};

let flowRows = loadFlowRows();

function loadFlowRows() {
  try {
    const saved = JSON.parse(localStorage.getItem(FLOW_STORAGE_KEY) || "null");
    if (Array.isArray(saved)) return saved.map(normalizeFlowRow).filter((row) => row.date);
  } catch {}
  return FLOW_EXAMPLE_ROWS.map((row) => ({ ...row }));
}

function normalizeFlowRow(row) {
  return {
    id: String(row?.id || `${Date.now()}-${Math.random()}`),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(row?.date || "")) ? String(row.date) : "",
    spot: Number.isFinite(Number(row?.spot)) ? Number(row.spot) : 0,
    futures: Number.isFinite(Number(row?.futures)) ? Number(row.futures) : 0,
  };
}

function saveFlowRows() {
  try { localStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(flowRows)); } catch {}
}

function classifyFlow(spot, futures) {
  if (spot > 0 && futures > 0) return { key: "joint", label: flowText.patterns.joint };
  if (spot <= 0 && futures > 0) return { key: "cover", label: flowText.patterns.cover };
  if (spot > 0 && futures <= 0) return { key: "hedge", label: flowText.patterns.hedge };
  return { key: "risk", label: flowText.patterns.risk };
}

function latestFive(rows) {
  return rows.filter((row) => row.date).slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-5);
}

function summarizeFlow(rows) {
  const window = latestFive(rows);
  const spotTotal = window.reduce((sum, row) => sum + row.spot, 0);
  const futuresTotal = window.reduce((sum, row) => sum + row.futures, 0);
  const spotBuyDays = window.filter((row) => row.spot > 0).length;
  const futuresBuyDays = window.filter((row) => row.futures > 0).length;
  const jointBuyDays = window.filter((row) => row.spot > 0 && row.futures > 0).length;
  const riskOffDays = window.filter((row) => row.spot <= 0 && row.futures <= 0).length;
  const recentJointDays = window.slice(-3).filter((row) => row.spot > 0 && row.futures > 0).length;
  let stageIndex;
  if (window.length >= 5 && spotTotal > 0 && futuresTotal > 0 && jointBuyDays >= 4 && spotBuyDays >= 4 && futuresBuyDays >= 4 && recentJointDays === 3) stageIndex = 4;
  else if (window.length >= 3 && spotTotal > 0 && futuresTotal > 0 && jointBuyDays >= 3 && recentJointDays >= 2) stageIndex = 3;
  else if (futuresTotal > 0 && (spotTotal > 0 || spotBuyDays >= 2)) stageIndex = 2;
  else if (futuresTotal > 0 && spotTotal <= 0) stageIndex = 1;
  else if ((spotTotal < 0 && futuresTotal < 0) || riskOffDays >= Math.max(2, Math.ceil(window.length * 0.6))) stageIndex = 0;
  else stageIndex = 2;
  return { window, spotTotal, futuresTotal, spotBuyDays, futuresBuyDays, jointBuyDays, stageIndex, stage: flowText.stages[stageIndex] };
}

function formatFlowTrillion(value) {
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}${FLOW_IS_EN ? "T KRW" : "조원"}`;
}

function flowCommentary(summary) {
  if (!summary.window.length) return FLOW_IS_EN ? "Add data to calculate the latest five-session foreign flow." : "데이터를 입력하면 최신 5거래일 외국인 수급을 자동으로 해석합니다.";
  const notesKo = [
    "현물과 선물에서 위험 회피가 함께 나타나 추가 변동성에 주의가 필요합니다.",
    "선물 매수는 들어왔지만 현물 자금 유입이 뒤따르지 않아 단기 반등 성격이 강합니다.",
    "선물 매수는 강하지만 현물 매수의 연속성이 부족해 중기 바닥은 아직 확인 중입니다.",
    "현물과 선물의 동반 순매수가 늘며 단기 반등에서 실제 매집으로 이동하는 신호가 보입니다.",
    "현물과 선물의 동반 매수가 연속적으로 확인돼 상승 흐름의 신뢰도가 높아지고 있습니다.",
  ];
  const notesEn = [
    "Risk-off flow is visible in both spot and futures, calling for caution on further volatility.",
    "Futures buying has appeared, but spot inflow has not followed, so the move still resembles a short-term rebound.",
    "Futures buying is positive, but spot-buying continuity is not yet strong enough to confirm a medium-term bottom.",
    "Joint spot and futures buying is increasing, suggesting a shift from rebound to accumulation.",
    "Repeated joint buying in spot and futures is improving confidence in the upward trend.",
  ];
  if (FLOW_IS_EN) return `Over the latest ${summary.window.length} sessions, foreign investors were ${formatFlowTrillion(summary.spotTotal)} in spot and ${formatFlowTrillion(summary.futuresTotal)} in futures. Joint buying appeared on ${summary.jointBuyDays} day(s). ${notesEn[summary.stageIndex]}`;
  return `최근 ${summary.window.length}거래일 동안 외국인은 현물 ${formatFlowTrillion(summary.spotTotal)}, 선물 ${formatFlowTrillion(summary.futuresTotal)}이었습니다. 현물·선물 동반 매수는 ${summary.jointBuyDays}일입니다. ${notesKo[summary.stageIndex]}`;
}

function flowEscape(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderFlowTable() {
  const sorted = flowRows.slice().sort((a, b) => a.date.localeCompare(b.date));
  flowEls.tableBody.innerHTML = sorted.map((row) => {
    const pattern = classifyFlow(row.spot, row.futures);
    return `<tr data-flow-id="${flowEscape(row.id)}">
      <td data-label="${FLOW_IS_EN ? "Date" : "거래일"}"><input data-flow-field="date" type="date" value="${flowEscape(row.date)}" aria-label="${FLOW_IS_EN ? "Date" : "거래일"}"></td>
      <td data-label="${FLOW_IS_EN ? "Spot" : "현물"}"><input data-flow-field="spot" type="number" step="0.1" value="${row.spot}" aria-label="${FLOW_IS_EN ? "Spot net buying" : "현물 순매수"}"></td>
      <td data-label="${FLOW_IS_EN ? "Futures" : "선물"}"><input data-flow-field="futures" type="number" step="0.1" value="${row.futures}" aria-label="${FLOW_IS_EN ? "Futures net buying" : "선물 순매수"}"></td>
      <td data-label="${FLOW_IS_EN ? "Classification" : "분류"}"><span class="flow-pattern" data-pattern="${pattern.key}">${flowEscape(pattern.label)}</span></td>
      <td><button type="button" class="flow-delete" data-flow-delete aria-label="${FLOW_IS_EN ? "Delete row" : "행 삭제"}">×</button></td>
    </tr>`;
  }).join("");
}

function renderFlow() {
  const summary = summarizeFlow(flowRows);
  flowEls.stage.textContent = summary.stage;
  flowEls.stageNote.textContent = (FLOW_IS_EN ? ["Risk-off dominates.", "Futures lead the rebound.", "A bottom is being tested.", "Accumulation is emerging.", "The trend is strengthening."] : ["위험 회피가 우세합니다.", "선물이 반등을 이끕니다.", "바닥을 확인하는 구간입니다.", "동반 매집이 늘고 있습니다.", "수급 추세가 강화되고 있습니다."])[summary.stageIndex];
  flowEls.stageTrack.innerHTML = flowText.stages.map((stage, index) => `<div class="flow-stage-step ${index <= summary.stageIndex ? "passed" : ""} ${index === summary.stageIndex ? "current" : ""}"><i></i><span>${flowEscape(stage)}</span></div>`).join("");
  flowEls.spotTotal.textContent = formatFlowTrillion(summary.spotTotal);
  flowEls.futuresTotal.textContent = formatFlowTrillion(summary.futuresTotal);
  flowEls.spotTotal.dataset.tone = summary.spotTotal >= 0 ? "positive" : "negative";
  flowEls.futuresTotal.dataset.tone = summary.futuresTotal >= 0 ? "positive" : "negative";
  flowEls.spotDays.textContent = FLOW_IS_EN ? `Bought ${summary.spotBuyDays}/${summary.window.length} days` : `순매수 ${summary.spotBuyDays}/${summary.window.length}일`;
  flowEls.futuresDays.textContent = FLOW_IS_EN ? `Bought ${summary.futuresBuyDays}/${summary.window.length} days` : `순매수 ${summary.futuresBuyDays}/${summary.window.length}일`;
  flowEls.jointDays.textContent = FLOW_IS_EN ? `${summary.jointBuyDays} days` : `${summary.jointBuyDays}일`;
  flowEls.window.textContent = FLOW_IS_EN ? `${summary.window.length} sessions` : `${summary.window.length}거래일`;
  flowEls.commentary.textContent = flowCommentary(summary);
  renderFlowTable();
}

flowEls.tableBody?.addEventListener("input", (event) => {
  const input = event.target.closest("[data-flow-field]");
  const row = event.target.closest("[data-flow-id]");
  if (!input || !row) return;
  const target = flowRows.find((item) => item.id === row.dataset.flowId);
  if (!target) return;
  const field = input.dataset.flowField;
  target[field] = field === "date" ? input.value : Number(input.value || 0);
  saveFlowRows(); renderFlow();
});

flowEls.tableBody?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-flow-delete]");
  const row = event.target.closest("[data-flow-id]");
  if (!button || !row) return;
  flowRows = flowRows.filter((item) => item.id !== row.dataset.flowId);
  saveFlowRows(); renderFlow();
});

flowEls.add?.addEventListener("click", () => {
  const lastDate = latestFive(flowRows).at(-1)?.date;
  const next = lastDate ? new Date(`${lastDate}T12:00:00`) : new Date();
  if (lastDate) next.setDate(next.getDate() + 1);
  const date = next.toISOString().slice(0, 10);
  flowRows.push({ id: `${Date.now()}`, date, spot: 0, futures: 0 });
  saveFlowRows(); renderFlow();
});

flowEls.reset?.addEventListener("click", () => {
  flowRows = FLOW_EXAMPLE_ROWS.map((row) => ({ ...row }));
  saveFlowRows(); renderFlow();
});

renderFlow();

window.ForeignFlowPulseCore = { classifyFlow, latestFive, summarizeFlow, formatFlowTrillion };
