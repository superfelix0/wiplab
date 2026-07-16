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

const liquidityNumber = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 1,
});
const liquidityDateTime = new Intl.DateTimeFormat("ko-KR", {
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

let liquidityData = null;
let liquidityRange = "1y";

function setLiquidityStatus(message, state = "neutral") {
  if (!liquidityEls.status) return;
  liquidityEls.status.textContent = message;
  liquidityEls.status.dataset.state = state;
}

function formatUsdBillions(value) {
  if (!Number.isFinite(value)) return "확인 필요";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `${liquidityNumber.format(value / 1000)}조 달러`;
  }
  return `${liquidityNumber.format(value)}십억 달러`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "확인 필요";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function formatChange(value) {
  if (!Number.isFinite(value)) return "확인 필요";
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

  if (liquidityRange === "1y") {
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  } else if (liquidityRange === "6m") {
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 6);
  } else if (liquidityRange === "3m") {
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
  }

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

  return rows.map((row) => ({
    date: row.date,
    value: (row.value / base) * 100,
  }));
}

function pathFrom(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function renderSummary(data) {
  const { summary } = data;
  const toneText = summary.tone === "positive" ? "우호적" : summary.tone === "negative" ? "긴축적" : "혼재";

  liquidityEls.summary.innerHTML = `
    <article data-tone="${summary.tone}">
      <span>통합판단</span>
      <strong>${summary.label}</strong>
      <small>${summary.description}</small>
    </article>
    <article>
      <span>우호 지표</span>
      <strong>${summary.positives}/${summary.total}</strong>
      <small>최근 약 ${data.lookbackDays}일 변화 기준 · 현재 흐름은 ${toneText}</small>
    </article>
    <article>
      <span>${summary.marketLiquidity.label}</span>
      <strong>${formatUsdBillions(summary.marketLiquidity.latest)}</strong>
      <small>${summary.marketLiquidity.formula} · 3개월 변화 ${formatChange(summary.marketLiquidity.change)}</small>
    </article>
  `;
}

function renderCards(data) {
  liquidityEls.cards.innerHTML = data.series
    .map((item) => {
      const directionText = item.positiveWhen === "up" ? "증가하면 우호적" : "감소하면 우호적";
      const signalText = item.signal.favorable ? "유동성 우호" : "유동성 부담";
      const staleText = item.stale ? " · 임시 fallback 데이터" : "";
      return `
        <article data-tone="${item.signal.tone}">
          <div class="market-card-head">
            <span>${item.label}</span>
            <span class="market-badge-row"><span class="market-badge">${item.stale ? "FALLBACK" : item.fredId}</span></span>
          </div>
          <strong>${formatUsdBillions(item.latest.value)}</strong>
          <p>${item.latest.date} 기준 · 약 3개월 변화 ${formatChange(item.change)} (${formatPercent(item.pctChange)})</p>
          <small>${signalText} · ${directionText}${staleText}. ${item.note}</small>
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
  const min = Math.min(...values) * 0.985;
  const max = Math.max(...values) * 1.015;
  const firstDate = normalized.flatMap((item) => item.chartRows.map((row) => row.date)).sort()[0];
  const lastDate = normalized.flatMap((item) => item.chartRows.map((row) => row.date)).sort().at(-1);
  const firstTime = new Date(`${firstDate}T00:00:00Z`).getTime();
  const lastTime = new Date(`${lastDate}T00:00:00Z`).getTime();

  const x = (dateText) => {
    const t = new Date(`${dateText}T00:00:00Z`).getTime();
    return pad.left + ((t - firstTime) / Math.max(1, lastTime - firstTime)) * (width - pad.left - pad.right);
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
    .map((item) => `<span><i style="background:${LINE_COLORS[item.id] || "#d8a13a"}"></i>${item.shortLabel}</span>`)
    .join("");
}

function renderSources(data) {
  liquidityEls.sources.innerHTML = data.sources
    .map((source) => `
      <li>
        <a href="${source.sourceUrl}" target="_blank" rel="noopener noreferrer">FRED ${source.fredId} · ${source.label}</a>
        <span>Federal Reserve Economic Data 공개 시계열입니다.</span>
      </li>
    `)
    .join("");
}

function renderLiquidity(data) {
  renderSummary(data);
  renderCards(data);
  renderChart(data);
  renderSources(data);
}

async function loadLiquidity() {
  liquidityEls.refresh.disabled = true;
  setLiquidityStatus("미국 유동성 데이터를 불러오는 중입니다.");

  try {
    const response = await fetch(`/api/liquidity?ts=${Date.now()}`, { cache: "no-store" });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      throw new Error(data?.message || "미국 유동성 데이터를 불러오지 못했습니다.");
    }

    liquidityData = data;
    renderLiquidity(data);
    setLiquidityStatus(`업데이트 완료: ${formatFetchedAt(data.fetchedAt)} · ${data.disclaimer}`, "ok");
  } catch (error) {
    setLiquidityStatus(error.message || "미국 유동성 데이터를 불러오지 못했습니다.", "error");
  } finally {
    liquidityEls.refresh.disabled = false;
  }
}

liquidityEls.range?.addEventListener("change", (event) => {
  liquidityRange = event.target.value;
  if (liquidityData) renderChart(liquidityData);
});

liquidityEls.refresh.addEventListener("click", loadLiquidity);
loadLiquidity();
