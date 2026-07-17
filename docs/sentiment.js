const sentimentEls = {
  status: document.querySelector("#sentimentStatus"),
  refresh: document.querySelector("#sentimentRefresh"),
  summary: document.querySelector("#sentimentSummary"),
  detail: document.querySelector("#sentimentDetail"),
  range: document.querySelector("#sentimentRange"),
};

const fmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const fmtDateTime = new Intl.DateTimeFormat("ko-KR", {
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

let rawRows = [];
let dataMode = "loading";
let selectedFreq = "W";
let selectedRange = "1y";
let dataMeta = null;
let vixData = null;

function setSentimentStatus(message, state = "neutral") {
  if (!sentimentEls.status) return;
  sentimentEls.status.textContent = message;
  sentimentEls.status.dataset.state = state;
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return NaN;
  return Number(String(value).replaceAll(",", "").trim());
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  const dateIndex = headers.indexOf("date");
  const closeIndex = headers.indexOf("close");
  const flowIndex = headers.indexOf("indiv_krw");

  if (dateIndex < 0 || closeIndex < 0 || flowIndex < 0) {
    throw new Error("CSV에는 date, close, indiv_krw 열이 필요합니다.");
  }

  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return {
      date: cells[dateIndex]?.trim(),
      close: toNumber(cells[closeIndex]),
      indivKrw: toNumber(cells[flowIndex]),
    };
  }).filter((row) => row.date && Number.isFinite(row.close) && Number.isFinite(row.indivKrw));
}

async function fetchJsonIfAvailable(url) {
  try {
    const response = await fetch(`${url}?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function formatUpdateMeta(meta, latestDate) {
  const dataDate = meta?.lastDataDate || latestDate;

  if (meta?.generatedAt) {
    return `자료 기준 ${dataDate} · 수집 ${fmtDateTime.format(new Date(meta.generatedAt))}`;
  }

  return `자료 기준 ${dataDate}`;
}

function sampleRows() {
  const rows = [];
  const start = new Date("2025-01-02T00:00:00+09:00");
  const end = new Date();
  let close = 2420;
  let index = 0;

  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue;

    const wave = Math.sin(index / 8) * 0.006 + Math.cos(index / 19) * 0.004;
    const shock = [38, 74, 116, 163, 224, 302].includes(index) ? -0.028 : [55, 138, 190, 248, 329].includes(index) ? 0.025 : 0;
    const ret = wave + shock + (Math.sin(index * 2.17) * 0.003);
    close *= 1 + ret;

    let indivT = -0.62 * (ret * 100) + Math.sin(index / 5) * 0.18;
    if ([38, 116, 224, 302].includes(index)) indivT -= 1.55;
    if ([55, 138, 248, 329].includes(index)) indivT += 1.45;

    rows.push({
      date: day.toISOString().slice(0, 10),
      close: Math.round(close * 100) / 100,
      indivKrw: Math.round(indivT * 1e12),
    });
    index += 1;
  }

  return rows;
}

function regression(points) {
  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.ret, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.indivT, 0) / n;
  const ssX = points.reduce((sum, p) => sum + (p.ret - meanX) ** 2, 0);
  const ssY = points.reduce((sum, p) => sum + (p.indivT - meanY) ** 2, 0);
  const cov = points.reduce((sum, p) => sum + (p.ret - meanX) * (p.indivT - meanY), 0);
  const slope = ssX === 0 ? 0 : cov / ssX;
  const intercept = meanY - slope * meanX;
  const residuals = points.map((p) => p.indivT - (intercept + slope * p.ret));
  const sse = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const r2 = ssY === 0 ? 0 : 1 - sse / ssY;
  const sd = Math.sqrt(sse / Math.max(1, n - 2)) || 1;
  return { slope, intercept, r2, sd };
}

function dailySeries(rows) {
  const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
  return sorted.slice(1).map((row, index) => {
    const prev = sorted[index];
    return {
      date: row.date,
      close: row.close,
      indivT: row.indivKrw / 1e12,
      ret: ((row.close / prev.close) - 1) * 100,
    };
  });
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
    const prev = grouped[index];
    return {
      date: week.date,
      close: week.close,
      indivT: week.indivKrw / 1e12,
      ret: ((week.close / prev.close) - 1) * 100,
    };
  });
}

function analyze(rows, freq) {
  const points = freq === "W" ? weeklySeries(rows) : dailySeries(rows);
  const model = regression(points);
  const thr = freq === "W" ? 1.45 : 1.75;
  const band = freq === "W" ? 0.8 : 0.5;

  const analyzed = points.map((point) => {
    const expected = model.intercept + model.slope * point.ret;
    const residual = point.indivT - expected;
    const z = residual / model.sd;
    const type = point.ret <= band && z <= -thr ? "fear" : point.ret >= -band && z >= thr ? "greed" : "normal";
    return { ...point, expected, residual, z, type };
  });

  return { points: analyzed, model, thr, band };
}

function latestSentiment(point) {
  if (point.type === "fear") {
    return {
      tone: "fear",
      label: "공포 신호",
      short: "공포",
      note: `개인 순매수가 평소 예상보다 ${Math.abs(point.residual).toFixed(2)}조원 부족했습니다.`,
    };
  }

  if (point.type === "greed") {
    return {
      tone: "greed",
      label: "탐욕 신호",
      short: "탐욕",
      note: `개인 순매수가 평소 예상보다 ${Math.abs(point.residual).toFixed(2)}조원 많았습니다.`,
    };
  }

  if (Math.abs(point.z) < 0.25) {
    return {
      tone: "neutral",
      label: "중립",
      short: "중립",
      note: "개인 순매수가 평소 움직임에서 크게 벗어나지 않았습니다.",
    };
  }

  if (point.z < 0) {
    return {
      tone: "fear-soft",
      label: "공포 쪽에 가까움",
      short: "공포 근접",
      note: `정식 공포 신호는 아니지만 개인 순매수가 예상보다 ${Math.abs(point.residual).toFixed(2)}조원 부족했습니다.`,
    };
  }

  return {
    tone: "greed-soft",
    label: "탐욕 쪽에 가까움",
    short: "탐욕 근접",
    note: `정식 탐욕 신호는 아니지만 개인 순매수가 예상보다 ${Math.abs(point.residual).toFixed(2)}조원 많았습니다.`,
  };
}

function filterRowsByRange(rows) {
  const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
  if (selectedRange === "all" || sorted.length === 0) return sorted;

  const latest = new Date(`${sorted.at(-1).date}T00:00:00+09:00`);
  const cutoff = new Date(latest);

  if (selectedRange === "1y") {
    cutoff.setFullYear(cutoff.getFullYear() - 1);
  } else if (selectedRange === "6m") {
    cutoff.setMonth(cutoff.getMonth() - 6);
  } else if (selectedRange === "3m") {
    cutoff.setMonth(cutoff.getMonth() - 3);
  }

  return sorted.filter((row) => new Date(`${row.date}T00:00:00+09:00`) >= cutoff);
}

function card({ label, value, sub, tone = "", wide = false }) {
  return `
    <article class="${wide ? "featured" : ""}" data-tone="${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${sub}</small>
    </article>
  `;
}

function volatilityCard({ label, value, date, history, source, color = "#6fbf73" }) {
  if (!Number.isFinite(value)) return "";

  const dailyExpectedMove = value / Math.sqrt(252);
  const volatilityDescription = `${label}는 연율화 변동성 지수이므로 대략적인 하루 예상 변동률은 지수값을 1년 거래일 수의 제곱근(√252)으로 나눠 추정합니다. 정규분포식 단순 환산이라 실제 하루 변동폭을 보장하지는 않습니다.`;
  return `
    <article class="featured" data-tone="volatility">
      <span>${label}</span>
      <strong>${fmt.format(value)}</strong>
      ${renderMiniLine(Array.isArray(history) ? history.slice(-66) : [], color, `${label} 최근 3개월 추이`)}
      <small>${date} 기준 · 최근 3개월 추이. ${volatilityDescription} 현재 기준 약 ±${dailyExpectedMove.toFixed(2)}%/일입니다.${source ? ` 출처: ${source}` : ""}</small>
    </article>
  `;
}

function renderMiniLine(rows, color = "#6fbf73", label = "변동성 최근 3개월 추이") {
  if (!Array.isArray(rows) || rows.length < 2) return "";

  const values = rows.map((row) => row.value).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = 220;
  const height = 56;
  const pad = 5;
  const x = (index) => pad + (index / Math.max(1, rows.length - 1)) * (width - pad * 2);
  const y = (value) => height - pad - ((value - min) / Math.max(1, max - min)) * (height - pad * 2);
  const path = rows
    .map((row, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(row.value).toFixed(1)}`)
    .join(" ");
  const latest = rows.at(-1);

  return `
    <svg class="mini-line" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" />
      <circle cx="${x(rows.length - 1).toFixed(1)}" cy="${y(latest.value).toFixed(1)}" r="3.5" fill="${color}" />
    </svg>
  `;
}

function renderSummary(analysis) {
  const latest = analysis.points.at(-1);
  const previous = analysis.points.at(-2);
  const modeLabel = dataMode === "live" ? "실데이터" : "합성 미리보기";
  const rangeLabel = sentimentEls.range?.selectedOptions?.[0]?.textContent || "1년";
  const updateLabel = formatUpdateMeta(dataMeta, latest.date);
  const latestView = latestSentiment(latest);
  const residualDirection = latest.residual < 0 ? "부족" : "초과";
  const kospiChange = previous ? ((latest.close / previous.close) - 1) * 100 : null;
  const volatility = dataMeta?.kospi200Volatility;

  const cards = [
    card({
      label: "최근 심리",
      value: latestView.short,
      sub: `${latest.date} · ${latestView.note}`,
      tone: latestView.tone,
      wide: true,
    }),
    card({
      label: "KOSPI",
      value: fmt.format(latest.close),
      sub: `${selectedFreq === "W" ? "주간" : "일간"} 수익률 ${latest.ret.toFixed(2)}%${kospiChange === null ? "" : ` · 직전 대비 ${kospiChange >= 0 ? "+" : ""}${kospiChange.toFixed(2)}%`}`,
    }),
    card({
      label: "개인 순매수",
      value: `${latest.indivT.toFixed(2)}조원`,
      sub: `${rangeLabel} 기준 · 평소 예상 ${latest.expected.toFixed(2)}조원 대비 ${Math.abs(latest.residual).toFixed(2)}조원 ${residualDirection}`,
      tone: latest.residual < 0 ? "fear-soft" : "greed-soft",
      wide: true,
    }),
    card({
      label: "데이터 상태",
      value: modeLabel,
      sub: updateLabel,
    }),
  ];

  if (volatility?.value) {
    cards.push(volatilityCard({
      label: "VKOSPI",
      value: volatility.value,
      date: volatility.date,
      history: volatility.history,
      source: volatility.source,
      color: "#6fbf73",
    }));
  }

  if (vixData?.value) {
    cards.push(volatilityCard({
      label: "VIX",
      value: vixData.value,
      date: vixData.date,
      history: vixData.history,
      source: vixData.source,
      color: "#d8a13a",
    }));
  }

  sentimentEls.summary.innerHTML = cards.join("");
}

function renderDetail(point) {
  const latestView = latestSentiment(point);
  const miss = point.residual < 0 ? "부족" : "초과";

  sentimentEls.detail.innerHTML = `
    <strong>${point.date} · ${latestView.label}</strong>
    <p>KOSPI는 ${fmt.format(point.close)}이고, 해당 구간 수익률은 ${point.ret.toFixed(2)}%입니다.</p>
    <p>이 수익률에서 평소라면 개인 순매수는 약 ${point.expected.toFixed(2)}조원으로 예상됩니다. 실제 개인 순매수는 ${point.indivT.toFixed(2)}조원으로, 평소보다 ${Math.abs(point.residual).toFixed(2)}조원 ${miss}했습니다.</p>
    <p>${latestView.note} 이 지표는 매수·매도 신호가 아니라, 시장 심리가 평소 패턴에서 얼마나 벗어났는지 보는 보조 지표입니다.</p>
  `;
}

function render() {
  if (!rawRows.length) return;
  const displayRows = filterRowsByRange(rawRows);
  const analysis = analyze(displayRows, selectedFreq);
  renderSummary(analysis);
  renderDetail(analysis.points.at(-1));
}

async function fetchSentimentData() {
  const staticResponse = await fetch(`/data/kospi-sentiment.csv?ts=${Date.now()}`, { cache: "no-store" });

  if (staticResponse.ok) {
    try {
      const csvText = await staticResponse.text();
      const rows = parseCsv(csvText);
      if (rows.length >= 120) {
        const meta = await fetchJsonIfAvailable("/data/kospi-sentiment-meta.json");
        const updateLabel = formatUpdateMeta(meta, rows.at(-1).date);
        return {
          rows,
          meta,
          mode: "daily-csv",
          message: `데이터 불러오기 성공. ${updateLabel}.`,
        };
      }
    } catch {
      // Cloudflare can return an HTML fallback before the scheduled CSV exists.
      // Ignore that and continue to the API/demo fallback.
    }
  }

  const response = await fetch(`/api/kospi-sentiment?ts=${Date.now()}`, { cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error("실데이터를 준비하는 중입니다.");
  }

  const meta = data.fetchedAt
    ? { generatedAt: new Date(data.fetchedAt).toISOString(), lastDataDate: data.rows.at(-1)?.date }
    : null;

  return {
    rows: data.rows,
    meta,
    mode: "live-api",
    message: `실데이터 API를 불러왔습니다. ${formatUpdateMeta(meta, data.rows.at(-1)?.date)}.`,
  };
}

async function fetchVixData() {
  const response = await fetch(`/api/vix?ts=${Date.now()}`, { cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || "VIX 데이터를 불러오지 못했습니다.");
  }
  return data;
}

async function loadData() {
  if (sentimentEls.refresh) sentimentEls.refresh.disabled = true;
  setSentimentStatus("데이터를 확인하는 중입니다.");

  try {
    const [loaded, vix] = await Promise.all([
      fetchSentimentData(),
      fetchVixData().catch(() => null),
    ]);
    rawRows = loaded.rows;
    dataMeta = loaded.meta;
    vixData = vix;
    dataMode = "live";
    setSentimentStatus(loaded.message, "ok");
  } catch (error) {
    rawRows = sampleRows();
    dataMeta = null;
    vixData = null;
    dataMode = "demo";
    setSentimentStatus("실데이터를 준비하는 중입니다. 현재 화면은 예시 데이터로 표시합니다.", "neutral");
  } finally {
    if (sentimentEls.refresh) sentimentEls.refresh.disabled = false;
    render();
  }
}

document.querySelectorAll("input[name='sentimentFreq']").forEach((input) => {
  input.addEventListener("change", (event) => {
    selectedFreq = event.target.value;
    render();
  });
});

sentimentEls.range?.addEventListener("change", (event) => {
  selectedRange = event.target.value;
  render();
});

sentimentEls.refresh?.addEventListener("click", loadData);
loadData();
