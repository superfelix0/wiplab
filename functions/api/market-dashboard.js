const SYMBOLS = {
  kospi200: "^KS200",
  kospi: "^KS11",
  nasdaq100: "^NDX",
  sp500: "^GSPC",
};

const SOURCES = [
  {
    title: "Business Insider: Goldman Sachs KOSPI 12,000 target",
    url: "https://www.businessinsider.com/kospi-stock-index-goldman-sachs-samsung-sk-hynix-goldman-sachs-2026-7",
    note: "KOSPI 12,000 12개월 목표와 이익 전망을 참고했습니다.",
  },
  {
    title: "MarketWatch: S&P 500 forward P/E 20.61",
    url: "https://www.marketwatch.com/livecoverage/stock-market-today-s-p-500-nasdaq-dow-chip-stocks-surge-sk-hynix-trading-debut-us/card/stocks-rally-into-an-expected-strong-earnings-season-as-valuations-get-cheaper-BS7L1QcqKbcqb6wE0v3Q",
    note: "S&P 500 forward P/E 20.61을 참고했습니다.",
  },
  {
    title: "Kiplinger: S&P 500 year-end 7,600 outlook",
    url: "https://www.kiplinger.com/investing/kiplingers-investing-playbook-for-the-second-half-of-2026",
    note: "S&P 500 연말 예상 지수 7,600을 참고했습니다.",
  },
  {
    title: "MarketWatch: oil retreat and U.S. equity target context",
    url: "https://www.marketwatch.com/story/as-oil-exits-the-danger-zone-heres-what-history-suggests-happens-next-for-stocks-7724a8a9",
    note: "미국 증시 목표치 상향 흐름과 기술주 우호 환경을 보조 참고했습니다.",
  },
];

function yahooChartUrl(symbol) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

async function fetchQuote(symbol) {
  const response = await fetch(yahooChartUrl(symbol), {
    headers: {
      "user-agent": "wiplabs-market-dashboard/1.0",
      accept: "application/json",
    },
    cf: {
      cacheTtl: 0,
      cacheEverything: false,
    },
  });

  if (!response.ok) {
    throw new Error(`${symbol} quote request failed with ${response.status}`);
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  const price = meta?.regularMarketPrice ?? meta?.previousClose;

  if (!meta || !Number.isFinite(price)) {
    throw new Error(`${symbol} quote is unavailable`);
  }

  return {
    symbol,
    price,
    previousClose: meta.previousClose ?? null,
    currency: meta.currency || "",
    exchange: meta.fullExchangeName || meta.exchangeName || "",
    marketTime: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null,
  };
}

function percentToTarget(current, target) {
  if (!Number.isFinite(current) || !Number.isFinite(target) || current === 0) {
    return null;
  }

  return (target - current) / current;
}

function buildMarkets(quotes) {
  const kospiTarget = 12000;
  const kospi200Target =
    Number.isFinite(quotes.kospi200.price) && Number.isFinite(quotes.kospi.price)
      ? quotes.kospi200.price * (kospiTarget / quotes.kospi.price)
      : null;
  const sp500Target = 7600;
  const nasdaqTarget =
    Number.isFinite(quotes.nasdaq100.price) && Number.isFinite(quotes.sp500.price)
      ? quotes.nasdaq100.price * (sp500Target / quotes.sp500.price)
      : null;

  return [
    {
      id: "kospi200",
      name: "KOSPI 200",
      symbol: SYMBOLS.kospi200,
      current: quotes.kospi200.price,
      target: kospi200Target,
      targetLabel: "KOSPI 12,000 환산",
      targetBasis: "Goldman Sachs의 KOSPI 12,000 목표를 현재 KOSPI200/KOSPI 비율로 환산했습니다.",
      forwardPer: 8.0,
      forwardPerLabel: "약 8.0x",
      forwardPerBasis: "기사 기반 관측치",
      trend: [
        { label: "랠리 전", value: 10.5, basis: "장기 평균에 가까운 내부 기준값" },
        { label: "최근 기사", value: 8.0, basis: "Goldman/MarketWatch 계열 기사에서 언급된 저평가 구간" },
        { label: "현재 표시", value: 8.0, basis: "기사 기반 최신 기준값 유지" },
      ],
      sourceIds: [0],
    },
    {
      id: "nasdaq100",
      name: "Nasdaq 100",
      symbol: SYMBOLS.nasdaq100,
      current: quotes.nasdaq100.price,
      target: nasdaqTarget,
      targetLabel: "S&P500 목표 수익률 환산",
      targetBasis: "공개 기사에서 Nasdaq100 단독 연말 목표가 확인되지 않아 S&P500 7,600 목표 수익률을 비교 벤치마크로 적용했습니다.",
      forwardPer: 30.0,
      forwardPerLabel: "약 30.0x",
      forwardPerBasis: "기술주 고평가/AI 랠리 기사 흐름을 반영한 임시 비교 기준입니다. 업데이트 필요.",
      trend: [
        { label: "Q1 조정", value: 27.0, basis: "기술주 조정 국면 비교 기준" },
        { label: "AI 랠리", value: 30.0, basis: "AI 중심 기술주 프리미엄 반영" },
        { label: "현재 표시", value: 30.0, basis: "수동 비교 기준" },
      ],
      sourceIds: [3],
      manualBenchmark: true,
    },
    {
      id: "sp500",
      name: "S&P 500",
      symbol: SYMBOLS.sp500,
      current: quotes.sp500.price,
      target: sp500Target,
      targetLabel: "연말 7,600",
      targetBasis: "Kiplinger의 2026년 하반기 전망 기사 기준입니다.",
      forwardPer: 20.61,
      forwardPerLabel: "20.61x",
      forwardPerBasis: "MarketWatch 기사 기준입니다.",
      trend: [
        { label: "연초", value: 22.2, basis: "2026년 초 고점권 밸류에이션" },
        { label: "1년 전", value: 22.54, basis: "MarketWatch 비교 수치" },
        { label: "현재", value: 20.61, basis: "MarketWatch 최신 기사" },
      ],
      sourceIds: [1, 2],
    },
  ].map((market) => ({
    ...market,
    upside: percentToTarget(market.current, market.target),
  }));
}

export async function onRequestGet() {
  try {
    const [kospi200, kospi, nasdaq100, sp500] = await Promise.all([
      fetchQuote(SYMBOLS.kospi200),
      fetchQuote(SYMBOLS.kospi),
      fetchQuote(SYMBOLS.nasdaq100),
      fetchQuote(SYMBOLS.sp500),
    ]);

    const quotes = {
      kospi200,
      kospi,
      nasdaq100,
      sp500,
    };

    return json({
      ok: true,
      quotes,
      markets: buildMarkets(quotes),
      sources: SOURCES,
      fetchedAt: Date.now(),
      disclaimer: "기사와 공개 시세를 결합한 실험용 화면이며 투자 권유가 아닙니다.",
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error.message || "Failed to fetch market dashboard data",
      },
      { status: 502 },
    );
  }
}
