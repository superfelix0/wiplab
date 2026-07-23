const WATCHLIST = [
  { id: "nasdaq-futures", label: "Nasdaq 100 futures", symbol: "NQ=F" },
  { id: "sp-futures", label: "S&P 500 futures", symbol: "ES=F" },
  { id: "nvidia", label: "NVIDIA", symbol: "NVDA" },
  { id: "semiconductor", label: "SOXX", symbol: "SOXX" },
];

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60, s-maxage=60", ...init.headers },
  });
}

async function quote(item) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.symbol)}?interval=1m&range=1d&includePrePost=true`;
  const response = await fetch(url, { headers: { "user-agent": "wiplabs-us-preview/1.0", accept: "application/json" }, cf: { cacheTtl: 60, cacheEverything: true } });
  if (!response.ok) throw new Error(`${item.symbol} returned ${response.status}`);
  const result = (await response.json())?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const times = result?.timestamp || [];
  let latest = null;
  for (let index = closes.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(closes[index])) { latest = { price: closes[index], time: times[index] ? times[index] * 1000 : null }; break; }
  }
  const meta = result?.meta || {};
  const price = latest?.price ?? meta.regularMarketPrice;
  const previousClose = Number.isFinite(meta.chartPreviousClose) ? meta.chartPreviousClose : meta.previousClose;
  if (!Number.isFinite(price)) throw new Error(`${item.symbol} has no quote`);
  return {
    ...item,
    price,
    previousClose: Number.isFinite(previousClose) ? previousClose : null,
    changePct: Number.isFinite(previousClose) && previousClose !== 0 ? (price - previousClose) / previousClose : null,
    marketState: meta.marketState || "UNKNOWN",
    delayMinutes: Number.isFinite(meta.exchangeDataDelayedBy) ? meta.exchangeDataDelayedBy : null,
    marketTime: meta.regularMarketTime ? meta.regularMarketTime * 1000 : latest?.time,
  };
}

export async function onRequestGet() {
  try {
    const items = await Promise.all(WATCHLIST.map(quote));
    return json({ ok: true, provider: "Yahoo Finance public chart endpoint", fetchedAt: Date.now(), items });
  } catch (error) {
    return json({ ok: false, message: error.message || "U.S. preview unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
