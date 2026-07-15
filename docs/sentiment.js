const sentimentEls = {
  status: document.querySelector("#sentimentStatus"),
  refresh: document.querySelector("#sentimentRefresh"),
  summary: document.querySelector("#sentimentSummary"),
  kospiChart: document.querySelector("#kospiSentimentChart"),
  scatterChart: document.querySelector("#flowScatterChart"),
  detail: document.querySelector("#sentimentDetail"),
  csv: document.querySelector("#sentimentCsv"),
  showFear: document.querySelector("#showFear"),
  showGreed: document.querySelector("#showGreed"),
};

const fmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const fmtDate = new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" });

let rawRows = [];
let dataMode = "loading";
let selectedFreq = "W";

function setSentimentStatus(message, state = "neutral") {
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
      weeks.set(key, { date: key, firstClose: row.close, close: row.close, indivKrw: 0 });
    }
    const week = weeks.get(key);
    week.close = row.close;
    week.indivKrw += row.indivKrw;
  }

  const grouped = Array.from(weeks.values()).sort((a, b) => a.date.localeCompare(b.date));
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

function svgEl(name, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function clearSvg(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function pathFrom(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function visibleSignal(point) {
  if (point.type === "fear") return sentimentEls.showFear.checked;
  if (point.type === "greed") return sentimentEls.showGreed.checked;
  return false;
}

function renderKospiChart(analysis) {
  const svg = sentimentEls.kospiChart;
  clearSvg(svg);

  const width = 900;
  const height = 340;
  const pad = { top: 26, right: 28, bottom: 44, left: 70 };
  const points = analysis.points;
  const closes = points.map((p) => p.close);
  const min = Math.min(...closes) * 0.985;
  const max = Math.max(...closes) * 1.015;
  const x = (i) => pad.left + (i / Math.max(1, points.length - 1)) * (width - pad.left - pad.right);
  const y = (v) => height - pad.bottom - ((v - min) / (max - min || 1)) * (height - pad.top - pad.bottom);

  [0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
    const yy = pad.top + ratio * (height - pad.top - pad.bottom);
    const value = max - ratio * (max - min);
    svg.append(svgEl("line", { x1: pad.left, y1: yy, x2: width - pad.right, y2: yy, class: "chart-grid-line" }));
    const label = svgEl("text", { x: pad.left - 10, y: yy + 4, "text-anchor": "end", class: "market-axis-label" });
    label.textContent = fmt0.format(value);
    svg.append(label);
  });

  const line = svgEl("path", {
    d: pathFrom(points.map((p, i) => ({ x: x(i), y: y(p.close) }))),
    class: "sentiment-line",
  });
  svg.append(line);

  [points[0], points[Math.floor(points.length / 2)], points.at(-1)].forEach((point) => {
    const i = points.indexOf(point);
    const label = svgEl("text", { x: x(i), y: height - 14, "text-anchor": i === 0 ? "start" : point === points.at(-1) ? "end" : "middle", class: "market-axis-label" });
    label.textContent = fmtDate.format(new Date(`${point.date}T00:00:00+09:00`));
    svg.append(label);
  });

  points.forEach((point, index) => {
    if (!visibleSignal(point)) return;
    const marker = svgEl("circle", {
      cx: x(index),
      cy: y(point.close),
      r: point.type === "fear" ? 6 : 5,
      class: `sentiment-marker ${point.type}`,
      tabindex: "0",
    });
    marker.addEventListener("click", () => renderDetail(point, analysis));
    svg.append(marker);
  });
}

function renderScatterChart(analysis) {
  const svg = sentimentEls.scatterChart;
  clearSvg(svg);

  const width = 900;
  const height = 340;
  const pad = { top: 26, right: 32, bottom: 52, left: 72 };
  const points = analysis.points;
  const retValues = points.map((p) => p.ret);
  const flowValues = points.map((p) => p.indivT);
  const minX = Math.min(-1, ...retValues) * 1.12;
  const maxX = Math.max(1, ...retValues) * 1.12;
  const minY = Math.min(-1, ...flowValues) * 1.12;
  const maxY = Math.max(1, ...flowValues) * 1.12;
  const x = (v) => pad.left + ((v - minX) / (maxX - minX || 1)) * (width - pad.left - pad.right);
  const y = (v) => height - pad.bottom - ((v - minY) / (maxY - minY || 1)) * (height - pad.top - pad.bottom);

  [0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
    const yy = pad.top + ratio * (height - pad.top - pad.bottom);
    const value = maxY - ratio * (maxY - minY);
    svg.append(svgEl("line", { x1: pad.left, y1: yy, x2: width - pad.right, y2: yy, class: "chart-grid-line" }));
    const label = svgEl("text", { x: pad.left - 10, y: yy + 4, "text-anchor": "end", class: "market-axis-label" });
    label.textContent = `${fmt.format(value)}조`;
    svg.append(label);
  });

  svg.append(svgEl("line", { x1: x(0), y1: pad.top, x2: x(0), y2: height - pad.bottom, class: "sentiment-axis-zero" }));
  svg.append(svgEl("line", { x1: pad.left, y1: y(0), x2: width - pad.right, y2: y(0), class: "sentiment-axis-zero" }));

  const regX1 = minX;
  const regX2 = maxX;
  const reg = svgEl("line", {
    x1: x(regX1),
    y1: y(analysis.model.intercept + analysis.model.slope * regX1),
    x2: x(regX2),
    y2: y(analysis.model.intercept + analysis.model.slope * regX2),
    class: "sentiment-regression",
  });
  svg.append(reg);

  points.forEach((point) => {
    const dot = svgEl("circle", {
      cx: x(point.ret),
      cy: y(point.indivT),
      r: point.type === "normal" ? 3 : 5,
      class: `sentiment-dot ${point.type}`,
      opacity: point.type === "normal" || visibleSignal(point) ? "1" : "0.12",
      tabindex: "0",
    });
    dot.addEventListener("click", () => renderDetail(point, analysis));
    svg.append(dot);
  });

  const xLabel = svgEl("text", { x: width - pad.right, y: height - 16, "text-anchor": "end", class: "market-axis-label" });
  xLabel.textContent = "수익률 %";
  svg.append(xLabel);
}

function renderSummary(analysis) {
  const latest = analysis.points.at(-1);
  const fearCount = analysis.points.filter((p) => p.type === "fear").length;
  const greedCount = analysis.points.filter((p) => p.type === "greed").length;
  const modeLabel = dataMode === "live" ? "실데이터" : dataMode === "csv" ? "업로드 CSV" : "합성 미리보기";

  sentimentEls.summary.innerHTML = `
    <article><span>데이터</span><strong>${modeLabel}</strong><small>${analysis.points.length}개 관측치 · ${selectedFreq === "W" ? "주간" : "일간"}</small></article>
    <article><span>평소 패턴</span><strong>R² ${analysis.model.r2.toFixed(2)}</strong><small>개인 순매수(조원) = ${analysis.model.slope.toFixed(2)} × 수익률 + ${analysis.model.intercept.toFixed(2)}</small></article>
    <article><span>최근 구간</span><strong>${latest.date}</strong><small>KOSPI ${fmt.format(latest.close)} · 수익률 ${latest.ret.toFixed(2)}% · 개인 ${latest.indivT.toFixed(2)}조원</small></article>
    <article><span>이탈 신호</span><strong>공포 ${fearCount} / 탐욕 ${greedCount}</strong><small>z-score 기준 ±${analysis.thr}, 보합 허용폭 ±${analysis.band}%</small></article>
  `;
}

function renderDetail(point) {
  const label = point.type === "fear" ? "공포" : point.type === "greed" ? "탐욕" : "일반";
  const miss = point.residual < 0 ? "부족" : "초과";
  sentimentEls.detail.innerHTML = `
    <strong>${point.date} · ${label} 구간</strong>
    <p>KOSPI ${fmt.format(point.close)}, 수익률 ${point.ret.toFixed(2)}%, 개인 순매수 ${point.indivT.toFixed(2)}조원입니다.</p>
    <p>평소 패턴상 예상 개인 순매수는 ${point.expected.toFixed(2)}조원이고, 실제는 ${Math.abs(point.residual).toFixed(2)}조원 ${miss}했습니다. z-score는 ${point.z.toFixed(2)}입니다.</p>
  `;
}

function render() {
  if (!rawRows.length) return;
  const analysis = analyze(rawRows, selectedFreq);
  renderSummary(analysis);
  renderKospiChart(analysis);
  renderScatterChart(analysis);

  const latestSignal = [...analysis.points].reverse().find((point) => point.type !== "normal");
  if (latestSignal) renderDetail(latestSignal, analysis);
}

async function fetchSentimentData() {
  const staticResponse = await fetch(`/data/kospi-sentiment.csv?ts=${Date.now()}`, { cache: "no-store" });

  if (staticResponse.ok) {
    const rows = parseCsv(await staticResponse.text());
    if (rows.length >= 120) {
      return {
        rows,
        mode: "daily-csv",
        message: `매일 수집 CSV를 불러왔습니다. ${rows.at(-1).date} 기준입니다.`,
      };
    }
  }

  const response = await fetch(`/api/kospi-sentiment?ts=${Date.now()}`, { cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || "실데이터 API가 아직 연결되지 않았습니다.");
  }
  return {
    rows: data.rows,
    mode: "live-api",
    message: "실데이터 API를 불러왔습니다. KRX/데이터 제공처 기준으로 지연될 수 있습니다.",
  };
}

async function loadData() {
  sentimentEls.refresh.disabled = true;
  setSentimentStatus("실데이터 API를 확인하는 중입니다.");

  try {
    const loaded = await fetchSentimentData();
    rawRows = loaded.rows;
    dataMode = "live";
    setSentimentStatus(loaded.message, "ok");
  } catch (error) {
    rawRows = sampleRows();
    dataMode = "demo";
    setSentimentStatus(`${error.message} 현재는 합성 미리보기로 화면과 로직만 표시합니다. 실제 CSV를 올리면 즉시 재계산됩니다.`, "error");
  } finally {
    sentimentEls.refresh.disabled = false;
    render();
  }
}

document.querySelectorAll("input[name='sentimentFreq']").forEach((input) => {
  input.addEventListener("change", (event) => {
    selectedFreq = event.target.value;
    render();
  });
});

[sentimentEls.showFear, sentimentEls.showGreed].forEach((input) => input.addEventListener("change", render));

sentimentEls.csv.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    rawRows = parseCsv(await file.text());
    dataMode = "csv";
    setSentimentStatus(`${file.name} 데이터를 분석했습니다.`, "ok");
    render();
  } catch (error) {
    setSentimentStatus(error.message || "CSV를 읽지 못했습니다.", "error");
  }
});

sentimentEls.refresh.addEventListener("click", loadData);
loadData();
