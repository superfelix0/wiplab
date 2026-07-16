const marketStatus = document.querySelector("#marketStatus");
const marketCards = document.querySelector("#marketCards");
const targetChart = document.querySelector("#targetChart");
const perChart = document.querySelector("#perChart");
const sourceList = document.querySelector("#sourceList");
const refreshButton = document.querySelector("#marketRefresh");

const formatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 1,
});

function setStatus(message, state = "") {
  if (!marketStatus) return;
  marketStatus.textContent = message;
  marketStatus.dataset.state = state;
}

function formatNumber(value) {
  return Number.isFinite(value) ? formatter.format(value) : "확인 필요";
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "확인 필요";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function formatPer(value) {
  return Number.isFinite(value) ? `${value.toFixed(value % 1 === 0 ? 0 : 1)}x` : "확인 필요";
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function fetchMarketPerData() {
  try {
    const response = await fetch(`/data/market-per.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function applyKrxPerData(data, perData) {
  const kospi200Per = perData?.markets?.kospi200;
  if (!kospi200Per || !Number.isFinite(kospi200Per.per)) {
    return data;
  }

  const markets = data.markets.map((market) => {
    if (market.id !== "kospi200") return market;

    const historicalAverage = Number.isFinite(kospi200Per.historicalAveragePer)
      ? kospi200Per.historicalAveragePer
      : market.historicalAveragePer;

    return {
      ...market,
      perMetricLabel: "KRX PER",
      forwardPer: kospi200Per.per,
      forwardPerLabel: `${kospi200Per.per.toFixed(2)}x`,
      forwardPerBasis: `KRX 지수 PER 기준입니다. 기준일: ${kospi200Per.date}`,
      historicalAveragePer: historicalAverage,
      historicalAverageLabel: `${historicalAverage.toFixed(2)}x`,
      historicalAverageBasis: `수집 기간 평균 PER입니다. 표본: ${kospi200Per.history?.length || "확인"}개 거래일`,
      perVsAverage: Number.isFinite(historicalAverage) && historicalAverage !== 0
        ? (kospi200Per.per - historicalAverage) / historicalAverage
        : null,
      trend: [
        { label: "수집 평균", value: historicalAverage, basis: "KRX 일별 PER 평균" },
        { label: "현재 PER", value: kospi200Per.per, basis: `KRX ${kospi200Per.date}` },
      ],
      krxPer: true,
      manualAverage: false,
    };
  });

  const sources = [
    ...(data.sources || []),
    {
      title: "KRX index fundamentals via pykrx",
      url: "https://github.com/sharebook-kr/pykrx",
      note: `KOSPI 200 현행 PER와 수집 기간 평균 PER를 매일 KRX 기준으로 갱신합니다. 최근 기준일: ${kospi200Per.date}`,
    },
  ];

  return { ...data, markets, sources, perData };
}

function clearSvg(svg) {
  if (!svg) return;
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }
}

function svgEl(name, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);

  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  return element;
}

function renderCards(data) {
  if (!marketCards) return;

  marketCards.innerHTML = data.markets
    .map((market) => {
      const quote = Object.values(data.quotes).find((item) => item.symbol === market.symbol);
      const time = quote ? formatTime(quote.marketTime) : "";
      const badges = [
        market.manualBenchmark ? '<span class="market-badge">목표 수동 기준</span>' : "",
        market.manualAverage ? '<span class="market-badge">평균 보완 필요</span>' : "",
        market.krxPer ? '<span class="market-badge">KRX PER</span>' : "",
      ].join("");

      return `
        <article>
          <div class="market-card-head">
            <span>${market.name}</span>
            <span class="market-badge-row">${badges}</span>
          </div>
          <strong>${formatNumber(market.current)}</strong>
          <dl>
            <div><dt>연말 예상</dt><dd>${formatNumber(market.target)}</dd></div>
            <div><dt>목표 대비</dt><dd>${formatPercent(market.upside)}</dd></div>
            <div><dt>${market.perMetricLabel || "Forward PER"}</dt><dd>${market.forwardPerLabel}</dd></div>
            <div><dt>역사적 평균 PER</dt><dd>${market.historicalAverageLabel}</dd></div>
            <div><dt>평균 대비</dt><dd>${formatPercent(market.perVsAverage)}</dd></div>
          </dl>
          <p>${market.targetBasis}</p>
          <p>${market.historicalAverageBasis}</p>
          <small>${market.symbol}${time ? ` · ${time}` : ""}</small>
        </article>
      `;
    })
    .join("");
}

function renderTargetChart(markets) {
  clearSvg(targetChart);
  if (!targetChart || !markets.length) return;

  const width = 900;
  const left = 130;
  const right = 40;
  const top = 32;
  const rowHeight = 76;
  const maxValue = Math.max(...markets.flatMap((market) => [market.current, market.target]).filter(Number.isFinite));
  const scale = (value) => left + (value / maxValue) * (width - left - right);

  markets.forEach((market, index) => {
    const y = top + index * rowHeight;
    const currentX = scale(market.current);
    const targetX = scale(market.target);

    const label = svgEl("text", { x: 16, y: y + 23, class: "market-axis-label" });
    label.textContent = market.name;
    targetChart.appendChild(label);

    targetChart.appendChild(svgEl("line", {
      x1: left,
      y1: y + 18,
      x2: width - right,
      y2: y + 18,
      class: "market-guide-line",
    }));

    targetChart.appendChild(svgEl("rect", {
      x: left,
      y: y + 5,
      width: Math.max(2, currentX - left),
      height: 18,
      rx: 2,
      class: "bar-current",
    }));

    targetChart.appendChild(svgEl("rect", {
      x: left,
      y: y + 31,
      width: Math.max(2, targetX - left),
      height: 18,
      rx: 2,
      class: "bar-target",
    }));

    const currentValue = svgEl("text", { x: Math.min(width - right - 72, currentX + 8), y: y + 19, class: "bar-value" });
    currentValue.textContent = formatNumber(market.current);
    targetChart.appendChild(currentValue);

    const targetValue = svgEl("text", { x: Math.min(width - right - 92, targetX + 8), y: y + 45, class: "bar-value" });
    targetValue.textContent = `${formatNumber(market.target)} (${formatPercent(market.upside)})`;
    targetChart.appendChild(targetValue);
  });
}

function renderPerChart(markets) {
  clearSvg(perChart);
  if (!perChart || !markets.length) return;

  const width = 900;
  const height = 300;
  const left = 58;
  const right = 36;
  const top = 28;
  const bottom = 70;
  const allValues = markets.flatMap((market) => market.trend.map((point) => point.value)).filter(Number.isFinite);
  const max = Math.max(...allValues, 1) * 1.15;
  const min = 0;
  const barColors = ["#1f4e79", "#a77b2d"];
  const yScale = (value) => height - bottom - ((value - min) / (max - min)) * (height - top - bottom);

  [0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
    const value = min + (max - min) * ratio;
    const y = yScale(value);

    perChart.appendChild(svgEl("line", {
      x1: left,
      y1: y,
      x2: width - right,
      y2: y,
      class: "chart-grid-line",
    }));

    const tick = svgEl("text", { x: 10, y: y + 4, class: "market-axis-label" });
    tick.textContent = `${compactFormatter.format(value)}x`;
    perChart.appendChild(tick);
  });

  const plotWidth = width - left - right;
  const groupWidth = plotWidth / markets.length;
  const barWidth = 30;
  const barGap = 8;

  markets.forEach((market, marketIndex) => {
    const groupStart = left + marketIndex * groupWidth;
    const groupCenter = groupStart + groupWidth / 2;
    const points = market.trend.slice(0, 2);
    const totalBarWidth = points.length * barWidth + (points.length - 1) * barGap;
    const firstBarX = groupCenter - totalBarWidth / 2;

    points.forEach((point, pointIndex) => {
      const barHeight = height - bottom - yScale(point.value);
      const x = firstBarX + pointIndex * (barWidth + barGap);
      const y = yScale(point.value);
      const color = barColors[pointIndex % barColors.length];

      perChart.appendChild(svgEl("rect", {
        x,
        y,
        width: barWidth,
        height: Math.max(1, barHeight),
        rx: 2,
        fill: color,
      }));

      const value = svgEl("text", {
        x: x + barWidth / 2,
        y: y - 7,
        "text-anchor": "middle",
        class: "bar-value",
      });
      value.textContent = formatPer(point.value);
      perChart.appendChild(value);
    });

    const marketLabel = svgEl("text", {
      x: groupCenter,
      y: height - 42,
      "text-anchor": "middle",
      class: "market-legend-text",
    });
    marketLabel.textContent = market.name;
    perChart.appendChild(marketLabel);
  });

  const legendItems = [
    { label: "역사 평균", color: barColors[0] },
    { label: "현재", color: barColors[1] },
  ];
  const legendStartX = left + 12;

  legendItems.forEach((item, index) => {
    const x = legendStartX + index * 130;

    perChart.appendChild(svgEl("rect", {
      x,
      y: height - 22,
      width: 18,
      height: 6,
      rx: 3,
      fill: item.color,
    }));

    const legend = svgEl("text", {
      x: x + 26,
      y: height - 16,
      class: "market-legend-text",
    });
    legend.textContent = item.label;
    perChart.appendChild(legend);
  });
}

function renderSources(sources) {
  if (!sourceList) return;
  sourceList.innerHTML = sources
    .map(
      (source) => `
        <li>
          <a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title}</a>
          <span>${source.note}</span>
        </li>
      `,
    )
    .join("");
}

async function loadMarketDashboard() {
  if (refreshButton) {
    refreshButton.disabled = true;
  }

  setStatus("시장 데이터를 불러오는 중입니다.");

  try {
    const response = await fetch(`/api/market-dashboard?ts=${Date.now()}`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "시장 데이터를 불러오지 못했습니다.");
    }

    const perData = await fetchMarketPerData();
    const dashboardData = applyKrxPerData(data, perData);

    renderCards(dashboardData);
    renderTargetChart(dashboardData.markets);
    renderPerChart(dashboardData.markets);
    renderSources(dashboardData.sources || []);
    setStatus(`업데이트 완료: ${formatTime(data.fetchedAt)} · ${data.disclaimer}`, "ok");
  } catch (error) {
    setStatus(error.message || "시장 데이터를 불러오지 못했습니다.", "error");
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
    }
  }
}

refreshButton?.addEventListener("click", loadMarketDashboard);
loadMarketDashboard();
