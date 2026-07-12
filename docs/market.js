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

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
      const manual = market.manualBenchmark ? '<span class="market-badge">수동 기준</span>' : "";

      return `
        <article>
          <div class="market-card-head">
            <span>${market.name}</span>
            ${manual}
          </div>
          <strong>${formatNumber(market.current)}</strong>
          <dl>
            <div><dt>연말 예상</dt><dd>${formatNumber(market.target)}</dd></div>
            <div><dt>목표 대비</dt><dd>${formatPercent(market.upside)}</dd></div>
            <div><dt>Forward PER</dt><dd>${market.forwardPerLabel}</dd></div>
          </dl>
          <p>${market.targetBasis}</p>
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
  const bottom = 48;
  const allValues = markets.flatMap((market) => market.trend.map((point) => point.value)).filter(Number.isFinite);
  const max = Math.max(...allValues, 1) * 1.15;
  const min = Math.max(0, Math.min(...allValues) * 0.75);
  const colors = ["#1f4e79", "#a77b2d", "#2f6f58"];
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

  markets.forEach((market, marketIndex) => {
    const points = market.trend.map((point, pointIndex) => {
      const x = left + (pointIndex / Math.max(1, market.trend.length - 1)) * (width - left - right);
      const y = yScale(point.value);
      return { ...point, x, y };
    });

    const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

    perChart.appendChild(svgEl("path", {
      d: path,
      fill: "none",
      stroke: colors[marketIndex % colors.length],
      "stroke-width": 3,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }));

    points.forEach((point) => {
      perChart.appendChild(svgEl("circle", {
        cx: point.x,
        cy: point.y,
        r: 4,
        fill: colors[marketIndex % colors.length],
      }));

      const value = svgEl("text", { x: point.x + 7, y: point.y - 7, class: "bar-value" });
      value.textContent = `${point.value}x`;
      perChart.appendChild(value);
    });

    const legend = svgEl("text", {
      x: left + 12 + marketIndex * 150,
      y: height - 16,
      fill: colors[marketIndex % colors.length],
      class: "market-legend-text",
    });
    legend.textContent = market.name;
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

    renderCards(data);
    renderTargetChart(data.markets);
    renderPerChart(data.markets);
    renderSources(data.sources || []);
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
