const marketStatus = document.querySelector("#marketStatus");
const marketCards = document.querySelector("#marketCards");
const marketPerChart = document.querySelector("#marketPerChart");
const marketPerLegend = document.querySelector("#marketPerLegend");
let perBacktest = document.querySelector("#perBacktest");
const sourceList = document.querySelector("#sourceList");
const refreshButton = document.querySelector("#marketRefresh");

const IS_EN = document.documentElement.lang?.toLowerCase().startsWith("en");
const numberFormatter = new Intl.NumberFormat(IS_EN ? "en-US" : "ko-KR", { maximumFractionDigits: 2 });
const dateTimeFormatter = new Intl.DateTimeFormat(IS_EN ? "en-US" : "ko-KR", {
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

let FORWARD_PER_CONSENSUS = {
  value: 6.35,
  date: "2026-07-09",
  sourceTitle: IS_EN
    ? "Investing.com / EBN: KOSPI 12-month forward PER 6.35x"
    : "Investing.com / EBN: KOSPI 12개월 선행 PER 6.35배",
  sourceUrl: "https://kr.investing.com/news/stock-market-news/article-2012684",
  note: IS_EN
    ? "The forward PER reference uses the article's cited Bloomberg estimate for KOSPI 12-month forward PER as of July 9, 2026."
    : "기사에서 블룸버그 보고서를 인용해 2026년 7월 9일 기준 KOSPI 12개월 선행 PER이 6.35배라고 언급한 값을 Forward PER 참고치로 사용합니다.",
};

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

function parseForwardPerHistory(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() || ""]));
    return {
      date: row.date,
      value: Number(row.value),
      sourceTitle: row.source_title,
      sourceUrl: row.source_url,
      sourceName: row.source_name,
      note: row.note,
    };
  }).filter((row) => row.date && Number.isFinite(row.value)).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchForwardPerHistory() {
  const response = await fetch(`/data/kospi-forward-per-history.csv?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Forward PER history unavailable");
  return parseForwardPerHistory(await response.text());
}

function parseKospiPerHistory(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() || ""]));
    return { date: row.date, per: Number(row.per), close: Number(row.close) };
  }).filter((row) => row.date && Number.isFinite(row.per) && Number.isFinite(row.close));
}

async function fetchKospiPerHistory() {
  const response = await fetch(`/data/kospi-per-history.csv?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("KOSPI PER history unavailable");
  return parseKospiPerHistory(await response.text());
}

function useLatestForwardPer(history) {
  const latest = history.at(-1);
  if (!latest) return;
  FORWARD_PER_CONSENSUS = {
    value: latest.value,
    date: latest.date,
    sourceTitle: latest.sourceTitle || FORWARD_PER_CONSENSUS.sourceTitle,
    sourceUrl: latest.sourceUrl || FORWARD_PER_CONSENSUS.sourceUrl,
    note: latest.note || FORWARD_PER_CONSENSUS.note,
  };
}

function t(ko, en) {
  return IS_EN ? en : ko;
}

function escapeMarketHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(message, state = "") {
  if (!marketStatus) return;
  marketStatus.textContent = message;
  marketStatus.dataset.state = state;
}

function formatPer(value) {
  return Number.isFinite(value) ? `${numberFormatter.format(value)}x` : t("확인 필요", "Needs data");
}

function formatDateTime(value) {
  if (!value) return "";
  return dateTimeFormatter.format(new Date(value));
}

function valuationMemo(currentPer, historicalPer, forwardPer) {
  const currentVsHistory = Number.isFinite(currentPer) && Number.isFinite(historicalPer)
    ? currentPer - historicalPer
    : null;
  const forwardIsLow = Number.isFinite(forwardPer)
    && Number.isFinite(currentPer)
    && Number.isFinite(historicalPer)
    && forwardPer < currentPer
    && forwardPer < historicalPer;

  if (forwardIsLow) {
    return {
      title: t("PER 판단 메모", "PER reading memo"),
      value: t("저평가 가능성과 이익 의구심 공존", "Low forward PER, but earnings trust matters"),
      badge: t("해석", "Read"),
      description: t(
        "Forward PER가 현행 PER보다 낮으면 미래 이익 기준으로는 저평가 가능성이 있습니다. 다만 시장이 향후 이익 전망을 충분히 신뢰하지 못하는 환경일 수도 있으므로, 평균 PER 대비 현재 수준과 이익 전망의 지속성을 함께 봐야 합니다.",
        "When forward PER is below current PER, the market can look inexpensive on expected earnings. But it may also mean investors doubt the durability of those earnings, so compare it with the historical average and earnings visibility."
      ),
      footnote: t(
        `현행 PER은 평균 PER보다 ${Number.isFinite(currentVsHistory) && currentVsHistory >= 0 ? "높은" : "낮은"} 구간입니다. Forward PER는 예상 이익이 바뀌면 함께 달라지는 참고 지표입니다.`,
        `Current PER is ${Number.isFinite(currentVsHistory) && currentVsHistory >= 0 ? "above" : "below"} the historical average. Forward PER is a reference point that moves with earnings estimates.`
      ),
    };
  }

  return {
    title: t("PER 판단 메모", "PER reading memo"),
    value: t("혼합 구간", "Mixed zone"),
    badge: t("해석", "Read"),
    description: t(
      "현행 PER, 역사적 평균, Forward PER의 방향이 엇갈립니다. 단순 고평가·저평가보다 이익 전망의 지속성을 함께 봐야 합니다.",
      "Current PER, historical average PER, and forward PER point in different directions. The key is whether the expected earnings path is durable."
    ),
    footnote: t(
      "Forward PER는 예상 이익이 바뀌면 함께 달라지는 참고 지표입니다.",
      "Forward PER is a reference point that changes when earnings estimates change."
    ),
  };
}

function svgEl(name, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function yearlyAveragePer(history = []) {
  const buckets = new Map();
  history.forEach((row) => {
    const per = Number(row.per);
    const year = String(row.date || "").slice(0, 4);
    if (!year || !Number.isFinite(per)) return;
    if (!buckets.has(year)) buckets.set(year, []);
    buckets.get(year).push(per);
  });

  return Array.from(buckets.entries())
    .map(([year, values]) => ({
      year,
      per: values.reduce((sum, value) => sum + value, 0) / values.length,
    }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

function renderMarketPerChart(perData) {
  if (!marketPerChart || !marketPerLegend) return;

  const kospi = perData.markets.kospi200;
  const annual = yearlyAveragePer(kospi.history || []);
  if (!annual.length) {
    marketPerChart.innerHTML = "";
    marketPerLegend.innerHTML = "";
    return;
  }

  const currentPer = Number(kospi.per);
  const forwardPer = FORWARD_PER_CONSENSUS.value;
  const historicalAveragePer = Number(kospi.historicalAveragePer);
  const values = annual.map((row) => row.per).concat([currentPer, forwardPer, historicalAveragePer]).filter(Number.isFinite);
  const min = Math.max(0, Math.floor(Math.min(...values) - 2));
  const max = Math.ceil(Math.max(...values) + 2);
  const width = 900;
  const height = 340;
  const pad = { top: 24, right: 96, bottom: 46, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (index) => pad.left + (annual.length === 1 ? innerW / 2 : (index / (annual.length - 1)) * innerW);
  const y = (value) => pad.top + ((max - value) / (max - min)) * innerH;

  marketPerChart.innerHTML = "";
  marketPerLegend.innerHTML = `
    <span><i style="background:var(--amber)"></i>${t("연도별 평균 PER", "Annual average PER")}</span>
    <span><i style="background:var(--muted)"></i>${t("평균 PER", "Average PER")} ${formatPer(historicalAveragePer)}</span>
    <span><i style="background:var(--green)"></i>${t("현재 PER", "Current PER")} ${formatPer(currentPer)}</span>
    <span><i style="background:var(--red)"></i>Forward PER ${formatPer(forwardPer)}</span>
  `;

  for (let i = 0; i <= 4; i += 1) {
    const value = min + ((max - min) / 4) * i;
    const yy = y(value);
    marketPerChart.append(svgEl("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: yy,
      y2: yy,
      stroke: "rgba(34,49,38,0.12)",
    }));
    const label = svgEl("text", {
      x: pad.left - 10,
      y: yy + 4,
      "text-anchor": "end",
      class: "market-axis-label",
    });
    label.textContent = value.toFixed(0);
    marketPerChart.append(label);
  }

  const path = annual
    .map((row, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(row.per).toFixed(1)}`)
    .join(" ");

  marketPerChart.append(svgEl("path", {
    d: path,
    fill: "none",
    stroke: "var(--amber)",
    "stroke-width": "3",
  }));

  annual.forEach((row, index) => {
    marketPerChart.append(svgEl("circle", {
      cx: x(index),
      cy: y(row.per),
      r: 3,
      fill: "var(--amber)",
    }));

    if (index === 0 || index === annual.length - 1 || Number(row.year) % 2 === 0) {
      const label = svgEl("text", {
        x: x(index),
        y: height - 20,
        "text-anchor": "middle",
        class: "market-axis-label",
      });
      label.textContent = row.year;
      marketPerChart.append(label);
    }
  });

  [
    { value: historicalAveragePer, label: `${t("평균", "Avg")} ${formatPer(historicalAveragePer)}`, color: "var(--muted)", dash: "2 6" },
    { value: currentPer, label: `${t("현재", "Current")} ${formatPer(currentPer)}`, color: "var(--green)" },
    { value: forwardPer, label: `Forward ${formatPer(forwardPer)}`, color: "var(--red)" },
  ].forEach((line) => {
    if (!Number.isFinite(line.value)) return;
    const yy = y(line.value);
    marketPerChart.append(svgEl("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: yy,
      y2: yy,
      stroke: line.color,
      "stroke-width": "2",
      "stroke-dasharray": line.dash || "6 5",
    }));
    const label = svgEl("text", {
      x: width - pad.right + 10,
      y: yy + 4,
      class: "market-axis-label",
      style: `fill:${line.color}`,
    });
    label.textContent = line.label;
    marketPerChart.append(label);
  });
}

function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
}

function futureIndex(history, index, days) {
  const start = new Date(`${history[index].date}T00:00:00Z`);
  const target = start.getTime() + (days * 24 * 60 * 60 * 1000);
  for (let cursor = index + 1; cursor < history.length; cursor += 1) {
    if (new Date(`${history[cursor].date}T00:00:00Z`).getTime() >= target) return cursor;
  }
  return -1;
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function renderPerBacktest(perData, perHistory = []) {
  if (!perBacktest) {
    const chartPanel = document.querySelector(".market-per-chart-panel");
    if (!chartPanel) return;
    perBacktest = document.createElement("section");
    perBacktest.id = "perBacktest";
    perBacktest.className = "per-backtest-panel";
    perBacktest.setAttribute("aria-live", "polite");
    chartPanel.after(perBacktest);
  }
  const history = perHistory
    .map((row) => ({ ...row, per: Number(row.per), close: Number(row.close) }))
    .filter((row) => row.date && Number.isFinite(row.per) && Number.isFinite(row.close));
  const currentPer = Number(perData?.markets?.kospi200?.per);
  if (!history.length || !Number.isFinite(currentPer)) {
    perBacktest.hidden = true;
    return;
  }

  const band = 0.1;
  const lower = currentPer * (1 - band);
  const upper = currentPer * (1 + band);
  const horizons = [
    { days: 91, ko: "3개월", en: "3 months" },
    { days: 182, ko: "6개월", en: "6 months" },
    { days: 365, ko: "12개월", en: "12 months" },
  ];
  const samples = [];
  let lastSample = -90;
  history.forEach((row, index) => {
    if (row.per < lower || row.per > upper || index - lastSample < 60) return;
    const returns = horizons.map((horizon) => {
      const later = futureIndex(history, index, horizon.days);
      return later > 0 ? (history[later].close / row.close) - 1 : null;
    });
    if (returns.every((value) => !Number.isFinite(value))) return;
    samples.push({ date: row.date, returns });
    lastSample = index;
  });

  const stats = horizons.map((horizon, index) => {
    const values = samples.map((sample) => sample.returns[index]).filter(Number.isFinite);
    return {
      ...horizon,
      count: values.length,
      low: percentile(values, 0.25),
      median: percentile(values, 0.5),
      high: percentile(values, 0.75),
    };
  });
  const latestSample = samples.at(-1)?.date || "--";
  perBacktest.hidden = false;
  perBacktest.innerHTML = `
    <div class="panel-head"><div><h2>${t("현재 PER 구간의 과거 사례", "What happened after similar PER levels")}</h2><p>${t("2010년 이후 KOSPI 일별 PER 기준", "KOSPI daily PER since 2010")}</p></div><strong>${formatPer(currentPer)}</strong></div>
    <p class="backtest-intro">${t(
      `현재 ${formatPer(currentPer)}의 ±10% 범위(${formatPer(lower)}~${formatPer(upper)})에 들어온 날을 최소 60거래일 간격으로 추렸습니다. 가장 최근 비교 사례는 ${latestSample}입니다.`,
      `We sample days within ±10% of the current ${formatPer(currentPer)} (${formatPer(lower)}–${formatPer(upper)}) at least 60 trading days apart. The latest comparable entry was ${latestSample}.`
    )}</p>
    <div class="backtest-grid">${stats.map((stat) => `
      <article><span>${IS_EN ? stat.en : stat.ko}</span><strong>${formatPct(stat.median)}</strong><small>${t(`중앙값 · ${stat.count}개 사례`, `Median · ${stat.count} samples`)}</small><p>${t("중간 50% 범위", "Middle 50% range")} ${formatPct(stat.low)} ~ ${formatPct(stat.high)}</p></article>
    `).join("")}</div>
    <p class="backtest-note">${t("과거 분포는 미래 수익률을 보장하지 않습니다. PER 구간은 금리·이익 전망·시장 구조가 달랐던 시기를 함께 포함합니다.", "Historical distributions do not predict or guarantee future returns. Comparable PER levels can occur under very different rates, earnings expectations, and market structures.")}</p>
  `;
}

async function fetchMarketPerData() {
  const response = await fetch(`/data/market-per.json?ts=${Date.now()}`, { cache: "no-store" });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.markets?.kospi200) {
    throw new Error(t("KRX PER 데이터를 불러오지 못했습니다.", "Could not load KRX PER data."));
  }

  return data;
}

function buildCards(perData) {
  const kospi = perData.markets.kospi200;
  const forwardPer = FORWARD_PER_CONSENSUS.value;

  return [
    valuationMemo(kospi.per, kospi.historicalAveragePer, forwardPer),
  ];
}

function renderCards(perData) {
  if (!marketCards) return;

  marketCards.innerHTML = buildCards(perData)
    .map((card) => `
      <article>
        <div class="market-card-head">
          <span>${card.title}</span>
          <span class="market-badge-row"><span class="market-badge">${card.badge}</span></span>
        </div>
        <strong>${card.value}</strong>
        <p>${card.description}</p>
        <small>${card.footnote}</small>
      </article>
    `)
    .join("");
}

function renderSources(perData) {
  if (!sourceList) return;

  const kospi = perData.markets.kospi200;
  const sources = [
    {
      title: "KRX index fundamentals via pykrx",
      url: "https://github.com/sharebook-kr/pykrx",
      note: t(
        `KOSPI 현행 PER와 2010년 이후 누적 평균 PER를 KRX 기준으로 갱신합니다. 최근 기준일: ${kospi.date}`,
        `Updates current KOSPI PER and the average PER since 2010 using KRX-based data. Latest data date: ${kospi.date}`
      ),
    },
    {
      title: FORWARD_PER_CONSENSUS.sourceTitle,
      url: FORWARD_PER_CONSENSUS.sourceUrl,
      note: FORWARD_PER_CONSENSUS.note,
    },
  ];

  sourceList.innerHTML = sources
    .map((source) => `
      <li>
        <a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title}</a>
        <span>${source.note}</span>
      </li>
    `)
    .join("");
}

function renderForwardPerComparison(history) {
  if (!sourceList) return;
  const oldPanel = document.querySelector("#forwardPerComparisonPanel");
  oldPanel?.remove();
  const rows = history.slice(-2).reverse();
  if (!rows.length) return;
  const panel = document.createElement("section");
  panel.id = "forwardPerComparisonPanel";
  panel.className = "source-panel forward-per-comparison";
  const heading = t("Forward PER 최신 비교", "Latest Forward PER comparison");
  const intro = t("최신 참고치와 직전 참고치만 표시합니다. 전체 이력은 CSV로 누적 관리합니다.", "Only the latest reference and its immediate predecessor are shown. The complete history is kept in CSV.");
  panel.innerHTML = `<h2>${heading}</h2><p>${intro}</p><ul></ul>`;
  const list = panel.querySelector("ul");
  list.innerHTML = rows.map((row, index) => {
    const label = index === 0 ? t("최신", "Latest") : t("직전", "Previous");
    const sourceLabel = escapeMarketHtml(row.sourceTitle || row.sourceName || t("출처", "Source"));
    const source = row.sourceUrl
      ? `<a href="${escapeMarketHtml(row.sourceUrl)}" target="_blank" rel="noopener noreferrer">${sourceLabel}</a>`
      : sourceLabel;
    return `<li><strong>${label} ${formatPer(row.value)}</strong><span>${escapeMarketHtml(row.date)} · ${source}</span></li>`;
  }).join("");
  sourceList.closest(".source-panel")?.before(panel);
}

async function loadMarketDashboard() {
  if (refreshButton) refreshButton.disabled = true;
  setStatus(t("KRX PER 데이터를 불러오는 중입니다.", "Loading KRX PER data."));

  try {
    const [perData, forwardHistory, perHistory] = await Promise.all([
      fetchMarketPerData(),
      fetchForwardPerHistory().catch(() => []),
      fetchKospiPerHistory().catch(() => []),
    ]);
    useLatestForwardPer(forwardHistory);
    renderCards(perData);
    renderMarketPerChart(perData);
    renderPerBacktest(perData, perHistory);
    renderSources(perData);
    renderForwardPerComparison(forwardHistory);
    setStatus(
      t(
        `업데이트 완료: ${formatDateTime(perData.generatedAt)} · 투자 권유가 아닌 참고용 실험 화면입니다.`,
        `Updated: ${formatDateTime(perData.generatedAt)} · Experimental reference page, not investment advice.`
      ),
      "ok"
    );
  } catch (error) {
    setStatus(error.message || t("KRX PER 데이터를 불러오지 못했습니다.", "Could not load KRX PER data."), "error");
  } finally {
    if (refreshButton) refreshButton.disabled = false;
  }
}

refreshButton?.addEventListener("click", loadMarketDashboard);
loadMarketDashboard();
