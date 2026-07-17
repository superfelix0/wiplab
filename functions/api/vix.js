function yahooVixUrl() {
  return "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=3mo";
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

export async function onRequestGet() {
  try {
    const response = await fetch(yahooVixUrl(), {
      headers: {
        "user-agent": "wiplabs-vix/1.0",
        accept: "application/json",
      },
      cf: {
        cacheTtl: 300,
        cacheEverything: false,
      },
    });

    if (!response.ok) {
      throw new Error(`VIX request failed with ${response.status}`);
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const timestamps = result?.timestamp || [];
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const observations = [];

    timestamps.forEach((timestamp, index) => {
      const value = closes[index];
      if (Number.isFinite(value)) {
        observations.push({
          date: toDateKey(timestamp),
          value,
        });
      }
    });

    const latest = observations.at(-1);
    if (!latest) {
      throw new Error("VIX daily close is unavailable");
    }

    return json({
      ok: true,
      name: "CBOE Volatility Index (VIX)",
      ticker: "^VIX",
      date: latest.date,
      value: latest.value,
      history: observations,
      source: "Yahoo Finance ^VIX chart API",
      sourceUrl: "https://finance.yahoo.com/quote/%5EVIX/",
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error.message || "Failed to fetch VIX data",
      },
      { status: 502 },
    );
  }
}
