const TICKERS = [
  { id: "kospi", label: "KOSPI", symbol: "^KS11", digits: 2 },
  { id: "nasdaq", label: "NASDAQ", symbol: "^IXIC", digits: 2 },
  { id: "sp500", label: "S&P500", symbol: "^GSPC", digits: 2 },
  { id: "usdk", label: "USD/KRW", symbol: "KRW=X", digits: 2 },
];

function yahooIntradayUrl(symbol) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=30, s-maxage=30",
      ...init.headers,
    },
  });
}

async function fetchLatestQuote(ticker) {
  const response = await fetch(yahooIntradayUrl(ticker.symbol), {
    headers: {
      "user-agent": "wiplabs-market-ticker/2.0",
      accept: "application/json",
    },
    cf: { cacheTtl: 30, cacheEverything: true },
  });

  if (!response.ok) throw new Error(`${ticker.symbol} intraday quote request failed with ${response.status}`);

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const timestamps = result?.timestamp || [];
  let lastBar = null;

  for (let index = closes.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(closes[index])) {
      lastBar = { price: closes[index], time: timestamps[index] ? timestamps[index] * 1000 : null };
      break;
    }
  }

  const price = Number.isFinite(meta?.regularMarketPrice) ? meta.regularMarketPrice : lastBar?.price;
  const previousClose = Number.isFinite(meta?.chartPreviousClose)
    ? meta.chartPreviousClose
    : Number.isFinite(meta?.previousClose)
      ? meta.previousClose
      : null;
  if (!Number.isFinite(price)) throw new Error(`${ticker.symbol} intraday quote is unavailable`);

  const change = Number.isFinite(previousClose) ? price - previousClose : null;
  return {
    id: ticker.id,
    label: ticker.label,
    symbol: ticker.symbol,
    close: price,
    previousClose,
    change,
    changePct: Number.isFinite(change) && previousClose !== 0 ? change / previousClose : null,
    marketTime: meta?.regularMarketTime ? meta.regularMarketTime * 1000 : lastBar?.time,
    marketState: meta?.marketState || "",
    exchange: meta?.fullExchangeName || meta?.exchangeName || "",
    delayMinutes: Number.isFinite(meta?.exchangeDataDelayedBy) ? meta.exchangeDataDelayedBy : null,
    digits: ticker.digits,
  };
}

export async function onRequestGet() {
  try {
    const items = await Promise.all(TICKERS.map(fetchLatestQuote));
    return json({
      ok: true,
      items,
      fetchedAt: Date.now(),
      provider: "Yahoo Finance",
      quoteType: "free delayed intraday",
    });
  } catch (error) {
    return json(
      { ok: false, message: error.message || "Failed to fetch market ticker" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
