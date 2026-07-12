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
    title: "MarketWatch: KOSPI 7.6 P/E after correction",
    url: "https://www.marketwatch.com/story/it-was-the-worlds-hottest-stock-market-now-south-koreas-stock-market-index-has-entered-bear-market-territory-95d70e3d",
    note: "최근 조정 이후 KOSPI 7.6배 P/E 언급을 참고했습니다.",
  },
  {
    title: "MarketWatch: S&P 500 forward P/E 20.61",
    url: "https://www.marketwatch.com/livecoverage/stock-market-today-s-p-500-nasdaq-dow-chip-stocks-surge-sk-hynix-trading-debut-us/card/stocks-rally-into-an-expected-strong-earnings-season-as-valuations-get-cheaper-BS7L1QcqKbcqb6wE0v3Q",
    note: "S&P 500 forward P/E 20.61을 참고했습니다.",
  },
  {
    title: "MarketWatch: S&P 500 historical forward P/E context",
    url: "https://www.marketwatch.com/story/how-to-lower-your-investment-risk-when-stocks-are-so-expensive-1bd1b881",
    note: "S&P 500 10년 평균 forward P/E 약 18.5배를 참고했습니다.",
  },
  {
    title: "Kiplinger: S&P 500 year-end 7,600 outlook",
    url: "https://www.kiplinger.com/investing/kiplingers-investing-playbook-for-the-second-half-of-2026",
    note: "S&P 500 연말 예상 지수 7,600을 참고했습니다.",
  },
  {
    title: "Investopedia: QQQ tracks the Nasdaq-100",
    url: "https://www.investopedia.com/ask/answers/061715/what-qqq-etf.asp",
    note: "Nasdaq 100 비교 지표는 QQQ/NDX의 기술주 중심 특성을 참고했습니다.",
  },
  {
    title: "Yahoo Finance chart API",
    url: "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC",
    note: "KOSPI 200, KOSPI, Nasdaq 100, S&P 500의 현재 지수 조회에 사용합니다.",
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

function diffToAverage(current, historicalAverage) {
  if (!Number.isFinite(current) || !Number.isFinite(historicalAverage) || historicalAverage === 0) {
    return null;
  }

  return (current - historicalAverage) / historicalAverage;
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
      forwardPer: 7.6,
      forwardPerLabel: "약 7.6x",
      forwardPerBasis: "MarketWatch의 최근 KOSPI P/E 언급을 KOSPI 200 비교 기준으로 사용했습니다.",
      historicalAveragePer: 10.5,
      historicalAverageLabel: "약 10.5x",
      historicalAverageBasis: "공개 기사에서 안정적인 KOSPI 200 장기 forward PER 평균이 확인되지 않아 한국 시장 장기 정상권 비교 기준으로 표시했습니다. 원천 데이터 확보 시 교체 대상입니다.",
      trend: [
        { label: "역사 평균", value: 10.5, basis: "장기 정상권 비교 기준" },
        { label: "현재 표시", value: 7.6, basis: "기사 기반 최신 기준값 유지" },
      ],
      sourceIds: [0, 1, 6],
      manualAverage: true,
    },
    {
      id: "nasdaq100",
      name: "Nasdaq 100",
      symbol: SYMBOLS.nasdaq100,
      current: quotes.nasdaq100.price,
      target: nasdaqTarget,
      targetLabel: "S&P500 목표 수익률 환산",
      targetBasis: "공개 기사에서 Nasdaq 100 단독 연말 목표가 확인되지 않아 S&P500 7,600 목표 수익률을 비교 벤치마크로 적용했습니다.",
      forwardPer: 30.0,
      forwardPerLabel: "약 30.0x",
      forwardPerBasis: "기술주·AI 중심 랠리 환경을 반영한 임시 비교 기준입니다.",
      historicalAveragePer: 25.0,
      historicalAverageLabel: "약 25.0x",
      historicalAverageBasis: "무료 공개 기사에서 Nasdaq 100의 공식 장기 forward PER 평균이 확인되지 않아 기술주 지수 장기 비교 기준으로 표시했습니다. 원천 데이터 확보 시 교체 대상입니다.",
      trend: [
        { label: "역사 평균", value: 25.0, basis: "기술주 지수 장기 비교 기준" },
        { label: "현재 표시", value: 30.0, basis: "수동 비교 기준" },
      ],
      sourceIds: [5, 6],
      manualBenchmark: true,
      manualAverage: true,
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
      historicalAveragePer: 18.5,
      historicalAverageLabel: "약 18.5x",
      historicalAverageBasis: "MarketWatch의 S&P 500 10년 평균 forward P/E 언급을 사용했습니다.",
      trend: [
        { label: "10년 평균", value: 18.5, basis: "MarketWatch 장기 평균" },
        { label: "현재", value: 20.61, basis: "MarketWatch 최신 기사" },
      ],
      sourceIds: [2, 3, 4, 6],
    },
  ].map((market) => ({
    ...market,
    upside: percentToTarget(market.current, market.target),
    perVsAverage: diffToAverage(market.forwardPer, market.historicalAveragePer),
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
