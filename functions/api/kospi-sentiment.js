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

function toNumber(value) {
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return NaN;
  return Number(String(value).replaceAll(",", "").trim());
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  const dateIndex = headers.indexOf("date");
  const closeIndex = headers.indexOf("close");
  const flowIndex = headers.indexOf("indiv_krw");

  if (dateIndex < 0 || closeIndex < 0 || flowIndex < 0) {
    throw new Error("CSV must include date, close, indiv_krw columns");
  }

  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return {
      date: cells[dateIndex]?.trim(),
      close: toNumber(cells[closeIndex]),
      indivKrw: toNumber(cells[flowIndex]),
    };
  }).filter((row) => row.date && Number.isFinite(row.close) && Number.isFinite(row.indivKrw));
}

async function fetchCsvRows(env) {
  const csvUrl = env.KOSPI_SENTIMENT_CSV_URL;

  if (!csvUrl) {
    throw new Error("KOSPI_SENTIMENT_CSV_URL is not configured");
  }

  const response = await fetch(csvUrl, {
    headers: {
      accept: "text/csv,text/plain,*/*",
      "user-agent": "wiplabs-kospi-sentiment/1.0",
    },
    cf: {
      cacheTtl: 0,
      cacheEverything: false,
    },
  });

  if (!response.ok) {
    throw new Error(`CSV source request failed with HTTP ${response.status}`);
  }

  const rows = parseCsv(await response.text());

  if (rows.length < 120) {
    throw new Error("CSV source does not contain enough observations");
  }

  return rows;
}

export async function onRequestGet({ env }) {
  try {
    const rows = await fetchCsvRows(env);

    return json({
      ok: true,
      mode: "csv-url",
      rows,
      fetchedAt: Date.now(),
      source: env.KOSPI_SENTIMENT_CSV_URL,
      disclaimer: "KRX 또는 외부 CSV 원천 기준 데이터입니다. 지연·오류 가능성이 있으며 투자 권유가 아닙니다.",
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error.message || "KOSPI sentiment data source is unavailable",
        requiredCsvColumns: ["date", "close", "indiv_krw"],
      },
      { status: 503 },
    );
  }
}
