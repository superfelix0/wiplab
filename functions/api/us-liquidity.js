const SERIES = [
  {
    id: "m2",
    fredId: "M2SL",
    label: "M2 통화량",
    shortLabel: "M2",
    unit: "십억 달러",
    scale: 1,
    positiveWhen: "up",
    sourceUrl: "https://fred.stlouisfed.org/series/M2SL",
    note: "가계와 기업이 보유한 넓은 의미의 통화량입니다. 늘어나면 거시 유동성에는 우호적으로 봅니다.",
  },
  {
    id: "reserves",
    fredId: "WRESBAL",
    label: "지급준비금",
    shortLabel: "Reserves",
    unit: "십억 달러",
    scale: 0.001,
    positiveWhen: "up",
    sourceUrl: "https://fred.stlouisfed.org/series/WRESBAL",
    note: "은행이 연준에 보유한 준비금입니다. 늘어나면 은행 시스템 내 유동성 여유가 커지는 방향입니다.",
  },
  {
    id: "rrp",
    fredId: "RRPONTSYD",
    label: "역레포(RRP)",
    shortLabel: "RRP",
    unit: "십억 달러",
    scale: 1,
    positiveWhen: "down",
    sourceUrl: "https://fred.stlouisfed.org/series/RRPONTSYD",
    note: "단기 자금이 연준 역레포에 머무는 규모입니다. 줄어들면 시장으로 풀릴 수 있는 돈이 늘어나는 방향입니다.",
  },
  {
    id: "tga",
    fredId: "WTREGEN",
    label: "재무부 일반계정(TGA)",
    shortLabel: "TGA",
    unit: "십억 달러",
    scale: 0.001,
    positiveWhen: "down",
    sourceUrl: "https://fred.stlouisfed.org/series/WTREGEN",
    note: "미 재무부의 연준 예금 잔고입니다. 늘어나면 민간·은행 시스템에서 돈을 흡수하는 방향으로 봅니다.",
  },
];

const FALLBACK_OBSERVATIONS = {
  M2SL: [
    { date: "2026-01-01", value: 22429.3 },
    { date: "2026-05-01", value: 23052.3 },
  ],
  WRESBAL: [
    { date: "2026-04-08", value: 3116.247 },
    { date: "2026-07-08", value: 3098.911 },
  ],
  RRPONTSYD: [
    { date: "2026-04-16", value: 0.158 },
    { date: "2026-07-15", value: 0.151 },
  ],
  WTREGEN: [
    { date: "2026-04-08", value: 748.376 },
    { date: "2026-07-08", value: 774.062 },
  ],
};

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

function fredCsvUrl(seriesId) {
  return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
}

function parseFredCsv(text, scale) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  return lines.slice(1)
    .map((line) => {
      const [date, rawValue] = line.split(",");
      const value = Number(rawValue);
      return {
        date,
        value: Number.isFinite(value) ? value * scale : null,
      };
    })
    .filter((row) => row.date && Number.isFinite(row.value));
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function findLookback(observations, latestDate, days) {
  const cutoff = addDays(latestDate, -days);
  let candidate = observations[0];

  for (const row of observations) {
    if (row.date <= cutoff) {
      candidate = row;
    } else {
      break;
    }
  }

  return candidate;
}

function pctChange(latest, previous) {
  if (!previous || previous.value === 0) return null;
  return (latest.value - previous.value) / previous.value;
}

function buildSignal(def, latest, previous) {
  const change = latest.value - previous.value;
  const favorable = def.positiveWhen === "up" ? change >= 0 : change <= 0;
  const direction = change >= 0 ? "증가" : "감소";

  return {
    favorable,
    direction,
    tone: favorable ? "positive" : "negative",
  };
}

async function fetchSeries(def) {
  let observations;
  let stale = false;
  let fetchError = "";

  try {
    const response = await fetch(fredCsvUrl(def.fredId), {
      headers: {
        "user-agent": "wiplabs-us-liquidity/1.0",
        accept: "text/csv,*/*",
      },
      cf: {
        cacheTtl: 3600,
        cacheEverything: false,
      },
    });

    if (!response.ok) {
      throw new Error(`${def.fredId} request failed with ${response.status}`);
    }

    observations = parseFredCsv(await response.text(), def.scale);
  } catch (error) {
    const fallback = FALLBACK_OBSERVATIONS[def.fredId];
    if (!fallback) throw error;
    observations = fallback;
    stale = true;
    fetchError = error.message || `${def.fredId} fallback used`;
  }

  const latest = observations.at(-1);
  const previous = findLookback(observations, latest.date, 90);
  const signal = buildSignal(def, latest, previous);

  return {
    id: def.id,
    fredId: def.fredId,
    label: def.label,
    shortLabel: def.shortLabel,
    unit: def.unit,
    positiveWhen: def.positiveWhen,
    sourceUrl: def.sourceUrl,
    note: def.note,
    latest,
    lookback: previous,
    stale,
    fetchError,
    change: latest.value - previous.value,
    pctChange: pctChange(latest, previous),
    signal,
    observations: observations.slice(-520),
  };
}

function buildSummary(series) {
  const positives = series.filter((item) => item.signal.favorable).length;
  const total = series.length;
  const reserve = series.find((item) => item.id === "reserves");
  const rrp = series.find((item) => item.id === "rrp");
  const tga = series.find((item) => item.id === "tga");

  const latestMarketLiquidity =
    reserve.latest.value - rrp.latest.value - tga.latest.value;
  const lookbackMarketLiquidity =
    reserve.lookback.value - rrp.lookback.value - tga.lookback.value;
  const marketLiquidityChange = latestMarketLiquidity - lookbackMarketLiquidity;

  let label = "혼재";
  let tone = "neutral";
  let description = "일부 지표는 우호적이고 일부 지표는 긴축적입니다. 방향성이 아직 한쪽으로 선명하지 않습니다.";

  if (positives >= 3) {
    label = "유동성 우호";
    tone = "positive";
    description = "최근 약 3개월 기준으로 다수 지표가 시장 유동성에 우호적인 방향입니다.";
  } else if (positives <= 1) {
    label = "유동성 긴축";
    tone = "negative";
    description = "최근 약 3개월 기준으로 다수 지표가 시장 유동성에 부담을 주는 방향입니다.";
  }

  return {
    label,
    tone,
    positives,
    total,
    description,
    marketLiquidity: {
      label: "실질 유동성 보조값",
      formula: "지급준비금 - RRP - TGA",
      latest: latestMarketLiquidity,
      lookback: lookbackMarketLiquidity,
      change: marketLiquidityChange,
    },
  };
}

export async function onRequestGet() {
  try {
    const series = await Promise.all(SERIES.map(fetchSeries));

    return json({
      ok: true,
      fetchedAt: Date.now(),
      lookbackDays: 90,
      summary: buildSummary(series),
      series,
      sources: SERIES.map(({ fredId, label, sourceUrl }) => ({ fredId, label, sourceUrl })),
      disclaimer: "FRED 공개 시계열을 조합한 참고용 실험 화면이며 투자 권유가 아닙니다.",
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error.message || "Failed to fetch US liquidity data",
      },
      { status: 502 },
    );
  }
}
