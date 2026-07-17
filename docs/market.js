const marketStatus = document.querySelector("#marketStatus");
const marketCards = document.querySelector("#marketCards");
const marketPerChart = document.querySelector("#marketPerChart");
const marketPerLegend = document.querySelector("#marketPerLegend");
const sourceList = document.querySelector("#sourceList");
const refreshButton = document.querySelector("#marketRefresh");

const numberFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

const FORWARD_PER_CONSENSUS = {
  value: 7.6,
  date: "2026-07",
  sourceTitle: "MarketWatch: KOSPI P/E after correction",
  sourceUrl: "https://www.marketwatch.com/story/it-was-the-worlds-hottest-stock-market-now-south-koreas-stock-market-index-has-entered-bear-market-territory-95d70e3d",
  note: "공개 기사에서 확인한 KOSPI P/E 언급을 Forward PER 컨센서스 비교값으로 임시 사용합니다. 더 안정적인 컨센서스 원천을 확보하면 교체 대상입니다.",
};

function setStatus(message, state = "") {
  if (!marketStatus) return;
  marketStatus.textContent = message;
  marketStatus.dataset.state = state;
}

function formatPer(value) {
  return Number.isFinite(value) ? `${numberFormatter.format(value)}x` : "확인 필요";
}

function formatDate(value) {
  return value || "기준일 확인 필요";
}

function formatDateTime(value) {
  if (!value) return "";
  return dateTimeFormatter.format(new Date(value));
}

function differenceFromAverage(current, average) {
  if (!Number.isFinite(current) || !Number.isFinite(average) || average === 0) {
    return null;
  }

  return (current - average) / average;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
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
  const values = annual.map((row) => row.per).concat([currentPer, forwardPer]).filter(Number.isFinite);
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
    <span><i style="background:var(--amber)"></i>연도별 평균 PER</span>
    <span><i style="background:var(--green)"></i>현재 PER ${formatPer(currentPer)}</span>
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
      stroke: "rgba(255,255,255,0.08)",
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
    { value: currentPer, label: `현재 ${formatPer(currentPer)}`, color: "var(--green)" },
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
      "stroke-dasharray": "6 5",
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

async function fetchMarketPerData() {
  const response = await fetch(`/data/market-per.json?ts=${Date.now()}`, { cache: "no-store" });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.markets?.kospi200) {
    throw new Error("KRX PER 데이터를 불러오지 못했습니다.");
  }

  return data;
}

function buildCards(perData) {
  const kospi = perData.markets.kospi200;
  const gap = differenceFromAverage(kospi.per, kospi.historicalAveragePer);

  return [
    {
      title: "KOSPI 역사적 평균 PER",
      value: formatPer(kospi.historicalAveragePer),
      badge: "KRX 평균",
      description: `2010년 이후 누적된 ${kospi.observationCount || kospi.history?.length || "최근"}개 거래일의 KOSPI PER 평균입니다.`,
      footnote: `${kospi.historicalAverageStart || kospi.history?.[0]?.date || "확인 필요"} ~ ${kospi.historicalAverageEnd || formatDate(kospi.date)} 기준`,
    },
    {
      title: "현행 PER",
      value: formatPer(kospi.per),
      badge: "KRX 현재",
      description: "KRX 지수 기본지표에서 가져온 KOSPI 현행 PER입니다.",
      footnote: `${formatDate(kospi.date)} 기준${Number.isFinite(gap) ? ` · 평균 대비 ${formatPercent(gap)}` : ""}`,
    },
    {
      title: "Forward PER 컨센서스",
      value: formatPer(FORWARD_PER_CONSENSUS.value),
      badge: "컨센서스",
      description: "향후 이익 전망을 반영한 비교용 PER입니다. KRX 현행 PER와 성격이 다르므로 방향성 비교로만 봅니다.",
      footnote: `${FORWARD_PER_CONSENSUS.date} 기준 · 보조 출처`,
    },
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
      note: `KOSPI 현행 PER와 2010년 이후 누적 평균 PER를 KRX 기준으로 갱신합니다. 최근 기준일: ${kospi.date}`,
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

async function loadMarketDashboard() {
  if (refreshButton) {
    refreshButton.disabled = true;
  }

  setStatus("KRX PER 데이터를 불러오는 중입니다.");

  try {
    const perData = await fetchMarketPerData();
    renderCards(perData);
    renderMarketPerChart(perData);
    renderSources(perData);
    setStatus(`업데이트 완료: ${formatDateTime(perData.generatedAt)} · 투자 권유가 아닌 참고용 실험 화면입니다.`, "ok");
  } catch (error) {
    setStatus(error.message || "KRX PER 데이터를 불러오지 못했습니다.", "error");
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
    }
  }
}

refreshButton?.addEventListener("click", loadMarketDashboard);
loadMarketDashboard();
