const FLOW_IS_EN = document.documentElement.lang?.toLowerCase().startsWith("en");

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
  updated: document.querySelector("#flowUpdated"),
  dataStatus: document.querySelector("#flowDataStatus"),
  source: document.querySelector("#flowSource"),
};

const flowText = {
  stages: FLOW_IS_EN
    ? ["Sell-off", "Short cover", "Bottom search", "Accumulation turn", "Trend strengthening"]
    : ["매도", "숏커버", "바닥 탐색", "매집 전환", "추세 강화"],
  patterns: {
    joint: FLOW_IS_EN ? "Joint buying" : "동반 매수",
    cover: FLOW_IS_EN ? "Futures-led rebound / short cover" : "선물 주도 반등·숏커버",
    hedge: FLOW_IS_EN ? "Arbitrage / hedge possibility" : "차익거래·헤지 가능성",
    risk: FLOW_IS_EN ? "Risk-off" : "위험 회피",
  },
};

let flowRows = [];

function normalizeFlowRow(row) {
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(row?.date || "")) ? String(row.date) : "",
    spot: Number.isFinite(Number(row?.spot)) ? Number(row.spot) : 0,
    futures: Number.isFinite(Number(row?.futures)) ? Number(row.futures) : 0,
  };
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
  const rounded = Math.abs(value) < 0.0005 ? 0 : value;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}${FLOW_IS_EN ? "T KRW" : "조원"}`;
}

function flowCommentary(summary) {
  if (!summary.window.length) return FLOW_IS_EN ? "No automatic data is available yet." : "아직 자동 수집된 데이터가 없습니다.";
  const notesKo = [
    "현물과 선물에서 위험 회피가 함께 나타나 추가 변동성에 주의할 구간입니다.",
    "선물 매수는 들어왔지만 현물 자금이 뒤따르지 않아 단기 반등 성격이 강합니다.",
    "선물 수급은 우호적이지만 현물 매수의 지속성을 더 확인해야 합니다.",
    "현물과 선물의 동반 매수가 늘며 반등에서 매집으로 옮겨가는 신호가 보입니다.",
    "현물과 선물의 동반 매수가 반복돼 상승 흐름의 신뢰도가 높아지고 있습니다.",
  ];
  const notesEn = [
    "Risk-off flow is visible in both spot and futures, calling for caution on further volatility.",
    "Futures buying has appeared, but spot inflow has not followed, so the move still resembles a short-term rebound.",
    "Futures flow is constructive, but spot-buying persistence needs more confirmation.",
    "Joint spot and futures buying is increasing, suggesting a shift from rebound to accumulation.",
    "Repeated joint buying in spot and futures is improving confidence in the upward trend.",
  ];
  const prefix = FLOW_IS_EN
    ? `Over the latest ${summary.window.length} session(s), foreign investors were ${formatFlowTrillion(summary.spotTotal)} in spot and ${formatFlowTrillion(summary.futuresTotal)} in futures. Joint buying appeared on ${summary.jointBuyDays} day(s).`
    : `최근 ${summary.window.length}거래일 동안 외국인은 현물 ${formatFlowTrillion(summary.spotTotal)}, 선물 ${formatFlowTrillion(summary.futuresTotal)}이었습니다. 현물·선물 동반 매수는 ${summary.jointBuyDays}일입니다.`;
  const provisional = summary.window.length < 5
    ? (FLOW_IS_EN ? ` The five-session window is still accumulating (${summary.window.length}/5), so this reading is provisional.` : ` 현재 5거래일 중 ${summary.window.length}일만 누적돼 판단은 잠정적입니다.`)
    : "";
  return `${prefix} ${FLOW_IS_EN ? notesEn[summary.stageIndex] : notesKo[summary.stageIndex]}${provisional}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderFlowTable() {
  const sorted = flowRows.slice().sort((a, b) => b.date.localeCompare(a.date));
  flowEls.tableBody.innerHTML = sorted.map((row) => {
    const pattern = classifyFlow(row.spot, row.futures);
    return `<tr>
      <td data-label="${FLOW_IS_EN ? "Date" : "거래일"}">${escapeHtml(row.date)}</td>
      <td data-label="${FLOW_IS_EN ? "Spot" : "현물"}" class="flow-number">${formatFlowTrillion(row.spot)}</td>
      <td data-label="${FLOW_IS_EN ? "Futures" : "선물"}" class="flow-number">${formatFlowTrillion(row.futures)}</td>
      <td data-label="${FLOW_IS_EN ? "Classification" : "자동 분류"}"><span class="flow-pattern" data-pattern="${pattern.key}">${escapeHtml(pattern.label)}</span></td>
    </tr>`;
  }).join("");
}

function renderFlow() {
  const summary = summarizeFlow(flowRows);
  const provisionalLabel = summary.window.length > 0 && summary.window.length < 5
    ? (FLOW_IS_EN ? " · provisional" : " · 잠정")
    : "";
  flowEls.stage.textContent = summary.window.length ? `${summary.stage}${provisionalLabel}` : "--";
  const stageNotes = FLOW_IS_EN
    ? ["Risk-off dominates.", "Futures lead the rebound.", "A bottom is being tested.", "Accumulation is emerging.", "The trend is strengthening."]
    : ["위험 회피가 우세합니다.", "선물이 반등을 이끕니다.", "바닥을 확인하는 구간입니다.", "동반 매집이 늘고 있습니다.", "수급 추세가 강화되고 있습니다."];
  flowEls.stageNote.textContent = summary.window.length ? stageNotes[summary.stageIndex] : (FLOW_IS_EN ? "Waiting for automatic data." : "자동 수집 데이터를 기다리는 중입니다.");
  flowEls.stageTrack.innerHTML = flowText.stages.map((stage, index) => `<div class="flow-stage-step ${summary.window.length && index <= summary.stageIndex ? "passed" : ""} ${summary.window.length && index === summary.stageIndex ? "current" : ""}"><i></i><span>${escapeHtml(stage)}</span></div>`).join("");
  flowEls.spotTotal.textContent = formatFlowTrillion(summary.spotTotal);
  flowEls.futuresTotal.textContent = formatFlowTrillion(summary.futuresTotal);
  flowEls.spotTotal.dataset.tone = summary.spotTotal >= 0 ? "positive" : "negative";
  flowEls.futuresTotal.dataset.tone = summary.futuresTotal >= 0 ? "positive" : "negative";
  flowEls.spotDays.textContent = FLOW_IS_EN ? `Bought ${summary.spotBuyDays}/${summary.window.length} days` : `순매수 ${summary.spotBuyDays}/${summary.window.length}일`;
  flowEls.futuresDays.textContent = FLOW_IS_EN ? `Bought ${summary.futuresBuyDays}/${summary.window.length} days` : `순매수 ${summary.futuresBuyDays}/${summary.window.length}일`;
  flowEls.jointDays.textContent = FLOW_IS_EN ? `${summary.jointBuyDays} day(s)` : `${summary.jointBuyDays}일`;
  flowEls.window.textContent = FLOW_IS_EN ? `${summary.window.length}/5 sessions` : `${summary.window.length}/5거래일`;
  flowEls.commentary.textContent = flowCommentary(summary);
  renderFlowTable();
}

async function loadFlowData() {
  try {
    const response = await fetch(`/data/foreign-flow-pulse.json?ts=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data?.ok || !Array.isArray(data.rows)) throw new Error("invalid F8 data");
    flowRows = data.rows.map(normalizeFlowRow).filter((row) => row.date);
    flowEls.updated.textContent = data.lastDataDate || "--";
    flowEls.dataStatus.textContent = FLOW_IS_EN ? "Automatic KRX data loaded" : "KRX 자동 수집 데이터 불러오기 성공";
    flowEls.source.href = data.source?.url || "https://data.krx.co.kr/";
    renderFlow();
  } catch {
    flowEls.dataStatus.textContent = FLOW_IS_EN ? "Automatic data is temporarily unavailable" : "자동 수집 데이터를 일시적으로 불러오지 못했습니다";
    renderFlow();
  }
}

loadFlowData();
window.ForeignFlowPulseCore = { classifyFlow, latestFive, summarizeFlow, formatFlowTrillion };
