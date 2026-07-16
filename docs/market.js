const marketStatus = document.querySelector("#marketStatus");
const marketCards = document.querySelector("#marketCards");
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
      description: `수집된 ${kospi.history?.length || "최근"}개 거래일의 KOSPI 200 PER 평균입니다.`,
      footnote: `수집 시작 ${kospi.history?.[0]?.date || "확인 필요"} · 최근 기준 ${formatDate(kospi.date)}`,
    },
    {
      title: "현행 PER",
      value: formatPer(kospi.per),
      badge: "KRX 현재",
      description: "KRX 지수 기본지표에서 가져온 KOSPI 200 현행 PER입니다.",
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
      note: `KOSPI 200 현행 PER와 수집 기간 평균 PER를 KRX 기준으로 갱신합니다. 최근 기준일: ${kospi.date}`,
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
