const TICKERS = [
  { id: "kospi", label: "KOSPI", symbol: "^KS11", digits: 2 },
  { id: "nasdaq", label: "NASDAQ", symbol: "^IXIC", digits: 2 },
  { id: "sp500", label: "S&P500", symbol: "^GSPC", digits: 2 },
  { id: "usdk", label: "USD/KRW", symbol: "KRW=X", digits: 2 },
];

function yahooDailyUrl(symbol) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=10d`;
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

function toDateKey(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

async function fetchLatestClose(ticker) {
  const response = await fetch(yahooDailyUrl(ticker.symbol), {
    headers: {
      "user-agent": "wiplabs-market-ticker/1.0",
      accept: "application/json",
    },
    cf: {
      cacheTtl: 300,
      cacheEverything: false,
    },
  });

  if (!response.ok) {
    throw new Error(`${ticker.symbol} daily close request failed with ${response.status}`);
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const valid = [];

  for (let index = timestamps.length - 1; index >= 0; index -= 1) {
    const close = closes[index];
    if (Number.isFinite(close)) {
      valid.push({ close, date: toDateKey(timestamps[index]) });
      if (valid.length === 2) break;
    }
  }

  if (valid.length >= 1) {
    const latest = valid[0];
    const previous = valid[1] || null;
    const change = previous ? latest.close - previous.close : null;
    const changePct = previous && previous.close !== 0 ? change / previous.close : null;

    return {
      id: ticker.id,
      label: ticker.label,
      symbol: ticker.symbol,
      close: latest.close,
      previousClose: previous?.close ?? null,
      change,
      changePct,
      date: latest.date,
      previousDate: previous?.date ?? null,
      digits: ticker.digits,
    };
  }

  throw new Error(`${ticker.symbol} daily close is unavailable`);
}

export async function onRequestGet() {
  try {
    const items = await Promise.all(TICKERS.map(fetchLatestClose));

    return json({
      ok: true,
      items,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error.message || "Failed to fetch market ticker",
      },
      { status: 502 },
    );
  }
}
