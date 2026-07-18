const marketStatus = document.querySelector("#marketStatus");
const marketCards = document.querySelector("#marketCards");
const marketPerChart = document.querySelector("#marketPerChart");
const marketPerLegend = document.querySelector("#marketPerLegend");
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

const FORWARD_PER_CONSENSUS = {
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

function t(ko, en) {
  return IS_EN ? en : ko;
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

async function loadMarketDashboard() {
  if (refreshButton) refreshButton.disabled = true;
  setStatus(t("KRX PER 데이터를 불러오는 중입니다.", "Loading KRX PER data."));

  try {
    const perData = await fetchMarketPerData();
    renderCards(perData);
    renderMarketPerChart(perData);
    renderSources(perData);
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
