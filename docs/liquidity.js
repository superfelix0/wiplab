const liquidityEls = {
  status: document.querySelector("#liquidityStatus"),
  refresh: document.querySelector("#liquidityRefresh"),
  summary: document.querySelector("#liquiditySummary"),
  cards: document.querySelector("#liquidityCards"),
  chart: document.querySelector("#liquidityChart"),
  legend: document.querySelector("#liquidityLegend"),
  sources: document.querySelector("#liquiditySources"),
  range: document.querySelector("#liquidityRange"),
};

const IS_EN = document.documentElement.lang?.toLowerCase().startsWith("en");
const liquidityNumber = new Intl.NumberFormat(IS_EN ? "en-US" : "ko-KR", { maximumFractionDigits: 1 });
const liquidityDateTime = new Intl.DateTimeFormat(IS_EN ? "en-US" : "ko-KR", {
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

const LINE_COLORS = {
  m2: "#6fbf73",
  reserves: "#d8a13a",
  rrp: "#c25242",
  tga: "#7f9cf5",
};

const SERIES_TEXT = {
  m2: {
    label: "M2 money stock",
    shortLabel: "M2",
    note: "A broad measure of money held by households and businesses. Rising M2 is generally supportive for macro liquidity.",
  },
  reserves: {
    label: "Reserve balances",
    shortLabel: "Reserves",
    note: "Bank reserves held at the Federal Reserve. Higher reserves usually mean more liquidity inside the banking system.",
  },
  rrp: {
    label: "Reverse repo (RRP)",
    shortLabel: "RRP",
    note: "Cash parked at the Fed's reverse repo facility. A falling RRP balance can release cash back toward markets.",
  },
  tga: {
    label: "Treasury General Account (TGA)",
    shortLabel: "TGA",
    note: "The U.S. Treasury's cash balance at the Fed. A rising TGA can drain money from the private and banking system.",
  },
};

let liquidityData = null;
let liquidityRange = "1y";

function t(ko, en) {
  return IS_EN ? en : ko;
}

function setLiquidityStatus(message, state = "neutral") {
  if (!liquidityEls.status) return;
  liquidityEls.status.textContent = message;
  liquidityEls.status.dataset.state = state;
}

function seriesText(item, field) {
  return IS_EN ? SERIES_TEXT[item.id]?.[field] || item[field] : item[field];
}

function summaryLabel(summary) {
  if (!IS_EN) return summary.label;
  if (summary.tone === "positive") return "Liquidity supportive";
  if (summary.tone === "negative") return "Liquidity restrictive";
  return "Mixed liquidity";
}

function summaryDescription(summary) {
  if (!IS_EN) return summary.description;
  if (summary.tone === "positive") return "Most indicators have moved in a market-friendly direction over the recent lookback window.";
  if (summary.tone === "negative") return "Most indicators have moved in a liquidity-draining direction over the recent lookback window.";
  return "The signals are mixed, so the liquidity backdrop is not one-sided.";
}

function formatUsdBillions(value) {
  if (!Number.isFinite(value)) return t("확인 필요", "Needs data");
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return IS_EN ? `${liquidityNumber.format(value / 1000)}T USD` : `${liquidityNumber.format(value / 1000)}조 달러`;
  }
  const decimals = abs > 0 && abs < 0.1 ? 2 : 1;
  const formatted = new Intl.NumberFormat(IS_EN ? "en-US" : "ko-KR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return IS_EN ? `${formatted}B USD` : `${formatted}십억 달러`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return t("확인 필요", "Needs data");
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function formatChange(value) {
  if (!Number.isFinite(value)) return t("확인 필요", "Needs data");
  return `${value >= 0 ? "+" : ""}${formatUsdBillions(value)}`;
}

function formatFetchedAt(value) {
  if (!value) return "";
  return liquidityDateTime.format(new Date(value));
}

function svgEl(name, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function clearSvg(svg) {
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function rangeCutoff(latestDate) {
  if (liquidityRange === "all") return null;
  const cutoff = new Date(`${latestDate}T00:00:00Z`);
  if (liquidityRange === "1y") cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  else if (liquidityRange === "6m") cutoff.setUTCMonth(cutoff.getUTCMonth() - 6);
  else if (liquidityRange === "3m") cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
  return cutoff.toISOString().slice(0, 10);
}

function filterObservations(observations) {
  if (!observations?.length || liquidityRange === "all") return observations || [];
  const latestDate = observations.at(-1).date;
  const cutoff = rangeCutoff(latestDate);
  return observations.filter((row) => row.date >= cutoff);
}

function normalizeObservations(observations) {
  const rows = observations.filter((row) => Number.isFinite(row.value));
  const base = rows[0]?.value;
  if (!Number.isFinite(base) || base === 0) return [];
  return rows.map((row) => ({ date: row.date, value: (row.value / base) * 100 }));
}

function pathFrom(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function renderSummary(data) {
  const { summary } = data;
  const toneText = summary.tone === "positive" ? t("우호적", "supportive") : summary.tone === "negative" ? t("긴축적", "restrictive") : t("혼재", "mixed");
  const marketLiquidityLabel = IS_EN ? "Real liquidity proxy" : summary.marketLiquidity.label;

  liquidityEls.summary.innerHTML = `
    <article data-tone="${summary.tone}">
      <span>${t("통합판단", "Overall read")}</span>
      <strong>${summaryLabel(summary)}</strong>
      <small>${summaryDescription(summary)}</small>
    </article>
    <article>
      <span>${t("우호 지표", "Supportive indicators")}</span>
      <strong>${summary.positives}/${summary.total}</strong>
      <small>${t("최근 약", "Recent")} ${data.lookbackDays}${t("일 변화 기준", "-day change")} · ${t("현재 흐름은", "current flow is")} ${toneText}</small>
    </article>
    <article>
      <span>${marketLiquidityLabel}</span>
      <strong>${formatUsdBillions(summary.marketLiquidity.latest)}</strong>
      <small>${summary.marketLiquidity.formula} · ${t("3개월 변화", "3-month change")} ${formatChange(summary.marketLiquidity.change)}</small>
    </article>
  `;
}

function renderCards(data) {
  liquidityEls.cards.innerHTML = data.series
    .map((item) => {
      const directionText = item.positiveWhen === "up" ? t("증가하면 우호적", "supportive when rising") : t("감소하면 우호적", "supportive when falling");
      const signalText = item.signal.favorable ? t("유동성 우호", "liquidity supportive") : t("유동성 부담", "liquidity drag");
      const staleText = item.stale ? t(" · 임시 fallback 데이터", " · fallback data") : "";
      return `
        <article data-tone="${item.signal.tone}">
          <div class="market-card-head">
            <span>${seriesText(item, "label")}</span>
            <span class="market-badge-row"><span class="market-badge">${item.stale ? "FALLBACK" : item.fredId}</span></span>
          </div>
          <strong>${formatUsdBillions(item.latest.value)}</strong>
          <p>${item.latest.date} · ${t("약 3개월 변화", "roughly 3-month change")} ${formatChange(item.change)} (${formatPercent(item.pctChange)})</p>
          <small>${signalText} · ${directionText}${staleText}. ${seriesText(item, "note")}</small>
        </article>
      `;
    })
    .join("");
}

function renderChart(data) {
  const svg = liquidityEls.chart;
  clearSvg(svg);
  if (!svg) return;

  const width = 900;
  const height = 340;
  const pad = { top: 28, right: 30, bottom: 46, left: 64 };
  const normalized = data.series.map((item) => ({
    ...item,
    chartRows: normalizeObservations(filterObservations(item.observations)),
  })).filter((item) => item.chartRows.length >= 2);

  const values = normalized.flatMap((item) => item.chartRows.map((row) => row.value));
  if (!values.length) return;
  const min = Math.min(...values) * 0.985;
  const max = Math.max(...values) * 1.015;
  const firstDate = normalized.flatMap((item) => item.chartRows.map((row) => row.date)).sort()[0];
  const lastDate = normalized.flatMap((item) => item.chartRows.map((row) => row.date)).sort().at(-1);
  const firstTime = new Date(`${firstDate}T00:00:00Z`).getTime();
  const lastTime = new Date(`${lastDate}T00:00:00Z`).getTime();

  const x = (dateText) => {
    const time = new Date(`${dateText}T00:00:00Z`).getTime();
    return pad.left + ((time - firstTime) / Math.max(1, lastTime - firstTime)) * (width - pad.left - pad.right);
  };
  const y = (value) => height - pad.bottom - ((value - min) / Math.max(1, max - min)) * (height - pad.top - pad.bottom);

  [0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
    const value = max - ratio * (max - min);
    const yy = y(value);
    svg.append(svgEl("line", { x1: pad.left, y1: yy, x2: width - pad.right, y2: yy, class: "chart-grid-line" }));
    const label = svgEl("text", { x: pad.left - 10, y: yy + 4, "text-anchor": "end", class: "market-axis-label" });
    label.textContent = liquidityNumber.format(value);
    svg.append(label);
  });

  normalized.forEach((item) => {
    const points = item.chartRows.map((row) => ({ x: x(row.date), y: y(row.value) }));
    svg.append(svgEl("path", {
      d: pathFrom(points),
      fill: "none",
      stroke: LINE_COLORS[item.id] || "#d8a13a",
      "stroke-width": "2.4",
    }));
  });

  [firstDate, lastDate].forEach((date, index) => {
    const label = svgEl("text", {
      x: index === 0 ? pad.left : width - pad.right,
      y: height - 15,
      "text-anchor": index === 0 ? "start" : "end",
      class: "market-axis-label",
    });
    label.textContent = date;
    svg.append(label);
  });

  liquidityEls.legend.innerHTML = normalized
    .map((item) => `<span><i style="background:${LINE_COLORS[item.id] || "#d8a13a"}"></i>${seriesText(item, "shortLabel")}</span>`)
    .join("");
}

function renderSources(data) {
  liquidityEls.sources.innerHTML = data.sources
    .map((source) => {
      const byFred = data.series?.find((item) => item.fredId === source.fredId);
      const label = IS_EN ? SERIES_TEXT[byFred?.id]?.label || source.label : source.label;
      return `
        <li>
          <a href="${source.sourceUrl}" target="_blank" rel="noopener noreferrer">FRED ${source.fredId} · ${label}</a>
          <span>${t("Federal Reserve Economic Data 공개 시계열입니다.", "Public time series from Federal Reserve Economic Data.")}</span>
        </li>
      `;
    })
    .join("");
}

function renderLiquidity(data) {
  renderSummary(data);
  renderCards(data);
  renderChart(data);
  renderSources(data);
}

async function loadLiquidity() {
  if (liquidityEls.refresh) liquidityEls.refresh.disabled = true;
  setLiquidityStatus(t("미국 유동성 데이터를 불러오는 중입니다.", "Loading U.S. liquidity data."));

  try {
    let response = await fetch(`/data/us-liquidity.json?ts=${Date.now()}`, { cache: "no-store" });
    let sourceLabel = t("정적 수집 데이터", "collected static data");
    if (!response.ok) {
      response = await fetch(`/api/liquidity?ts=${Date.now()}`, { cache: "no-store" });
      sourceLabel = t("실시간 API", "live API");
    }

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.message || t("미국 유동성 데이터를 불러오지 못했습니다.", "Could not load U.S. liquidity data."));
    }

    liquidityData = data;
    renderLiquidity(data);
    setLiquidityStatus(
      t(
        `업데이트 완료: ${formatFetchedAt(data.fetchedAt)} · ${sourceLabel} · ${data.disclaimer}`,
        `Updated: ${formatFetchedAt(data.fetchedAt)} · ${sourceLabel} · Experimental reference page, not investment advice.`
      ),
      "ok"
    );
  } catch (error) {
    setLiquidityStatus(error.message || t("미국 유동성 데이터를 불러오지 못했습니다.", "Could not load U.S. liquidity data."), "error");
  } finally {
    if (liquidityEls.refresh) liquidityEls.refresh.disabled = false;
  }
}

liquidityEls.range?.addEventListener("change", (event) => {
  liquidityRange = event.target.value;
  if (liquidityData) renderChart(liquidityData);
});

liquidityEls.refresh?.addEventListener("click", loadLiquidity);
loadLiquidity();
