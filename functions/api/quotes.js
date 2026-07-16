const ADR_SHARE_RATIO = 0.1;

const SYMBOLS = {
  adrCandidates: ["SKHY", "SKHYV"],
  naverAdrCandidates: ["SKHY.O", "SKHYV.O"],
  kospi: "000660.KS",
  naverKospi: "000660",
  fx: "KRW=X",
  naverFx: "FX_USDKRW",
};

function yahooChartUrl(symbol) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
}

function yahooHistoryUrl(symbol) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=max`;
}

function naverStockUrl(symbol) {
  return `https://m.stock.naver.com/api/stock/${encodeURIComponent(symbol)}/basic`;
}

function naverWorldStockUrl(symbol) {
  return `https://api.stock.naver.com/stock/${encodeURIComponent(symbol)}/basic`;
}

function naverExchangeUrl(symbol) {
  return `https://api.stock.naver.com/marketindex/exchange/${encodeURIComponent(symbol)}`;
}

function naverDomesticHistoryUrl(symbol) {
  return `https://api.stock.naver.com/chart/domestic/item/${encodeURIComponent(symbol)}?periodType=dayCandle`;
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
      "user-agent": "wiplab-quote-checker/1.0",
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
    currency: meta.currency,
    exchange: meta.fullExchangeName || meta.exchangeName || "",
    marketTime: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null,
  };
}

function parseNaverNumber(value) {
  if (typeof value !== "string") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchNaverStockQuote(symbol) {
  const response = await fetch(naverStockUrl(symbol), {
    headers: {
      "user-agent": "Mozilla/5.0 wiplab-quote-checker/1.0",
      accept: "application/json",
      referer: `https://m.stock.naver.com/domestic/stock/${encodeURIComponent(symbol)}`,
    },
    cf: {
      cacheTtl: 0,
      cacheEverything: false,
    },
  });

  if (!response.ok) {
    throw new Error(`${symbol} Naver quote request failed with ${response.status}`);
  }

  const data = await response.json();
  const selected = pickNaverDomesticPrice(data);

  if (!Number.isFinite(selected.price)) {
    throw new Error(`${symbol} Naver quote is unavailable`);
  }

  return {
    symbol: `${symbol}.KS`,
    price: selected.price,
    currency: "KRW",
    exchange: `Naver · ${data.stockExchangeName || "KOSPI"}`,
    marketTime: selected.marketTime,
    provider: "Naver Stock",
    marketStatus: data.marketStatus || "",
    delayTimeName: data.delayTimeName || "",
    sessionLabel: selected.sessionLabel,
  };
}

function pickNaverDomesticPrice(data) {
  const overMarket = data?.overMarketPriceInfo;
  const overPrice = parseNaverNumber(overMarket?.overPrice);
  const overTime = overMarket?.localTradedAt ? Date.parse(overMarket.localTradedAt) : null;

  if (overMarket?.overMarketStatus === "OPEN" && Number.isFinite(overPrice)) {
    return {
      price: overPrice,
      marketTime: Number.isFinite(overTime) ? overTime : null,
      sessionLabel: overMarket.tradingSessionType || "OVER_MARKET",
    };
  }

  const regularPrice = parseNaverNumber(data?.closePrice);
  const regularTime = data?.localTradedAt ? Date.parse(data.localTradedAt) : null;

  return {
    price: regularPrice,
    marketTime: Number.isFinite(regularTime) ? regularTime : null,
    sessionLabel: data?.marketStatus || "REGULAR",
  };
}

function pickNaverWorldPrice(data) {
  const overMarket = data?.overMarketPriceInfo;
  const overPrice = parseNaverNumber(overMarket?.overPriceRaw || overMarket?.overPrice);
  const overTime = overMarket?.localTradedAt ? Date.parse(overMarket.localTradedAt) : null;

  if (overMarket?.overMarketStatus === "OPEN" && Number.isFinite(overPrice)) {
    return {
      price: overPrice,
      marketTime: Number.isFinite(overTime) ? overTime : null,
      sessionLabel: overMarket.tradingSessionType || "OVER_MARKET",
    };
  }

  const regularPrice = parseNaverNumber(data?.closePrice);
  const regularTime = data?.localTradedAt ? Date.parse(data.localTradedAt) : null;

  return {
    price: regularPrice,
    marketTime: Number.isFinite(regularTime) ? regularTime : null,
    sessionLabel: data?.marketStatus || "REGULAR",
  };
}

async function fetchNaverWorldStockQuote(symbol) {
  const response = await fetch(naverWorldStockUrl(symbol), {
    headers: {
      "user-agent": "Mozilla/5.0 wiplab-quote-checker/1.0",
      accept: "application/json",
      referer: `https://stock.naver.com/worldstock/stock/${encodeURIComponent(symbol)}/price`,
    },
    cf: {
      cacheTtl: 0,
      cacheEverything: false,
    },
  });

  if (!response.ok) {
    throw new Error(`${symbol} Naver world quote request failed with ${response.status}`);
  }

  const data = await response.json();
  const selected = pickNaverWorldPrice(data);

  if (!Number.isFinite(selected.price)) {
    throw new Error(`${symbol} Naver world quote is unavailable`);
  }

  return {
    symbol,
    price: selected.price,
    currency: data?.currencyType?.code || "USD",
    exchange: `Naver · ${data.stockExchangeName || "NASDAQ"}`,
    marketTime: selected.marketTime,
    provider: "Naver World Stock",
    marketStatus: data?.marketStatus || "",
    delayTimeName: data?.delayTimeName || "",
    sessionLabel: selected.sessionLabel,
  };
}

async function fetchNaverExchangeQuote(symbol) {
  const response = await fetch(naverExchangeUrl(symbol), {
    headers: {
      "user-agent": "Mozilla/5.0 wiplab-quote-checker/1.0",
      accept: "application/json",
      referer: `https://stock.naver.com/marketindex/exchange/${encodeURIComponent(symbol)}/price`,
    },
    cf: {
      cacheTtl: 0,
      cacheEverything: false,
    },
  });

  if (!response.ok) {
    throw new Error(`${symbol} Naver exchange request failed with ${response.status}`);
  }

  const data = await response.json();
  const exchangeInfo = data?.exchangeInfo;
  const price = parseNaverNumber(exchangeInfo?.calcPrice || exchangeInfo?.closePrice);
  const marketTime = exchangeInfo?.localTradedAt ? Date.parse(exchangeInfo.localTradedAt) : null;

  if (!Number.isFinite(price)) {
    throw new Error(`${symbol} Naver exchange quote is unavailable`);
  }

  return {
    symbol,
    price,
    currency: exchangeInfo?.unit || "KRW",
    exchange: `Naver · ${exchangeInfo?.stockExchangeType?.nameKor || "Market Index"}`,
    marketTime: Number.isFinite(marketTime) ? marketTime : null,
    provider: "Naver Market Index",
    marketStatus: exchangeInfo?.marketStatus || "",
    delayTimeName: exchangeInfo?.priceDataType || "",
    sessionLabel: exchangeInfo?.degreeCount ? `${exchangeInfo.degreeCount}회차` : "",
  };
}

async function fetchNaverDomesticHistory(symbol) {
  const response = await fetch(naverDomesticHistoryUrl(symbol), {
    headers: {
      "user-agent": "Mozilla/5.0 wiplab-quote-checker/1.0",
      accept: "application/json",
      referer: `https://m.stock.naver.com/domestic/stock/${encodeURIComponent(symbol)}`,
    },
    cf: {
      cacheTtl: 300,
      cacheEverything: false,
    },
  });

  if (!response.ok) {
    throw new Error(`${symbol} Naver history request failed with ${response.status}`);
  }

  const data = await response.json();
  const priceInfos = Array.isArray(data?.priceInfos) ? data.priceInfos : [];
  const series = priceInfos
    .map((item) => {
      const localDate = String(item.localDate || "");
      const date = localDate.length === 8
        ? `${localDate.slice(0, 4)}-${localDate.slice(4, 6)}-${localDate.slice(6, 8)}`
        : "";

      return {
        date,
        time: date ? Date.parse(`${date}T00:00:00+09:00`) : null,
        value: Number(item.closePrice),
      };
    })
    .filter((point) => point.date && Number.isFinite(point.value))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!series.length) {
    throw new Error(`${symbol} Naver history is unavailable`);
  }

  return {
    symbol: `${symbol}.KS`,
    series,
  };
}

async function fetchChart(symbol, url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "wiplab-quote-checker/1.0",
      accept: "application/json",
    },
    cf: {
      cacheTtl: 300,
      cacheEverything: false,
    },
  });

  if (!response.ok) {
    throw new Error(`${symbol} chart request failed with ${response.status}`);
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];

  if (!result) {
    throw new Error(`${symbol} chart is unavailable`);
  }

  return result;
}

function toDateKey(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function parseHistorySeries(symbol, result) {
  const timestamps = result?.timestamp || [];
  const close = result?.indicators?.quote?.[0]?.close || [];

  const dailyLast = new Map();

  timestamps
    .map((time, index) => ({
      date: toDateKey(time),
      time: time * 1000,
      value: close[index],
    }))
    .filter((point) => Number.isFinite(point.value))
    .forEach((point) => {
      const previous = dailyLast.get(point.date);
      if (!previous || point.time >= previous.time) {
        dailyLast.set(point.date, point);
      }
    });

  return Array.from(dailyLast.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function latestValueOnOrBefore(series, date) {
  let value = null;

  for (const point of series) {
    if (point.date > date) {
      break;
    }

    value = point.value;
  }

  return value;
}

async function fetchHistory(symbol) {
  const result = await fetchChart(symbol, yahooHistoryUrl(symbol));
  const series = parseHistorySeries(symbol, result);

  if (!series.length) {
    throw new Error(`${symbol} history is unavailable`);
  }

  return {
    symbol,
    series,
  };
}

async function fetchFirstValidQuote(symbols) {
  const errors = [];

  for (const symbol of symbols) {
    try {
      return await fetchQuote(symbol);
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(errors.at(-1) || "ADR quote is unavailable");
}

async function fetchFirstValidNaverWorldQuote(symbols) {
  const errors = [];

  for (const symbol of symbols) {
    try {
      return await fetchNaverWorldStockQuote(symbol);
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(errors.at(-1) || "ADR quote is unavailable");
}

async function fetchFirstValidHistory(symbols) {
  const errors = [];

  for (const symbol of symbols) {
    try {
      return await fetchHistory(symbol);
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(errors.at(-1) || "ADR history is unavailable");
}

function buildHistory({ adr, kospi, fx }) {
  return adr.series
    .map((point) => {
      const kospiValue = latestValueOnOrBefore(kospi.series, point.date);
      const fxValue = latestValueOnOrBefore(fx.series, point.date);

      if (!Number.isFinite(kospiValue) || !Number.isFinite(fxValue)) {
        return null;
      }

      const adrConverted = (point.value * fxValue) / ADR_SHARE_RATIO;

      return {
        date: point.date,
        time: point.time,
        adrConverted,
        kospi: kospiValue,
        premium: (adrConverted - kospiValue) / kospiValue,
      };
    })
    .filter(Boolean);
}

export async function onRequestGet() {
  try {
    const [adr, kospi, fx, adrHistory, kospiHistory, fxHistory] = await Promise.all([
      fetchFirstValidNaverWorldQuote(SYMBOLS.naverAdrCandidates),
      fetchNaverStockQuote(SYMBOLS.naverKospi),
      fetchNaverExchangeQuote(SYMBOLS.naverFx),
      fetchFirstValidHistory(SYMBOLS.adrCandidates),
      fetchNaverDomesticHistory(SYMBOLS.naverKospi),
      fetchHistory(SYMBOLS.fx),
    ]);

    const converted = (adr.price * fx.price) / ADR_SHARE_RATIO;
    const gap = converted - kospi.price;
    const premium = gap / kospi.price;

    return json({
      ok: true,
      ratio: ADR_SHARE_RATIO,
      quotes: {
        adr,
        kospi,
        fx,
      },
      result: {
        converted,
        gap,
        premium,
      },
      history: buildHistory({
        adr: adrHistory,
        kospi: kospiHistory,
        fx: fxHistory,
      }),
      fetchedAt: Date.now(),
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error.message || "Failed to fetch quotes",
      },
      { status: 502 },
    );
  }
}
