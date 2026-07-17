from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path


KST = timezone(timedelta(hours=9))
OUTPUT = Path("docs/data/ai-earnings.json")

COMPANIES = [
    {"id": "tsmc", "name": "TSMC", "symbol": "TSM", "group": "Memory / Foundry", "currency": "USD"},
    {"id": "kioxia", "name": "Kioxia", "symbol": "285A.T", "group": "Memory / Storage", "currency": "JPY"},
    {"id": "sandisk", "name": "SanDisk", "symbol": "SNDK", "group": "Memory / Storage", "currency": "USD"},
    {"id": "micron", "name": "Micron", "symbol": "MU", "group": "Memory", "currency": "USD"},
    {"id": "samsung", "name": "Samsung Electronics", "symbol": "005930.KS", "group": "Memory / Foundry", "currency": "KRW"},
    {"id": "skhynix", "name": "SK Hynix", "symbol": "000660.KS", "group": "Memory", "currency": "KRW"},
    {"id": "microsoft", "name": "Microsoft", "symbol": "MSFT", "group": "Hyperscaler", "currency": "USD"},
    {"id": "amazon", "name": "Amazon", "symbol": "AMZN", "group": "Hyperscaler", "currency": "USD"},
    {"id": "alphabet", "name": "Alphabet", "symbol": "GOOGL", "group": "Hyperscaler", "currency": "USD"},
    {"id": "meta", "name": "Meta", "symbol": "META", "group": "Hyperscaler", "currency": "USD"},
    {"id": "oracle", "name": "Oracle", "symbol": "ORCL", "group": "Hyperscaler", "currency": "USD"},
]

METRICS = [
    "quarterlyTotalRevenue",
    "quarterlyNetIncome",
    "quarterlyOperatingIncome",
    "quarterlyOperatingCashFlow",
    "quarterlyCapitalExpenditure",
    "quarterlyFreeCashFlow",
    "quarterlyOperatingExpense",
    "quarterlyEBITDA",
    "quarterlyNormalizedEBITDA",
]


def yahoo_timeseries_url(symbol: str) -> str:
    period2 = int(time.time())
    period1 = int(time.mktime((datetime.now() - timedelta(days=620)).timetuple()))
    params = urllib.parse.urlencode({
        "symbol": symbol,
        "type": ",".join(METRICS),
        "period1": period1,
        "period2": period2,
    })
    return f"https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{urllib.parse.quote(symbol)}?{params}"


def raw_value(item: dict) -> float | None:
    value = item.get("reportedValue", {}).get("raw")
    if isinstance(value, (int, float)):
        return float(value)
    return None


def fetch_fundamentals(symbol: str) -> list[dict]:
    request = urllib.request.Request(
        yahoo_timeseries_url(symbol),
        headers={"User-Agent": "Mozilla/5.0 wiplabs-ai-earnings/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        data = json.loads(response.read().decode("utf-8"))

    quarters: dict[str, dict] = {}
    for result in data.get("timeseries", {}).get("result", []):
        for metric in METRICS:
            for item in result.get(metric, []) or []:
                date = item.get("asOfDate")
                value = raw_value(item)
                if not date or value is None:
                    continue
                quarters.setdefault(date, {"date": date})[metric] = value

    rows = [quarters[key] for key in sorted(quarters)]
    return rows[-6:]


def pct_change(current: float | None, previous: float | None) -> float | None:
    if current is None or previous in (None, 0):
        return None
    return (current - previous) / abs(previous)


def enrich_quarters(rows: list[dict]) -> list[dict]:
    enriched = []
    for index, row in enumerate(rows):
        profit = row.get("quarterlyNetIncome")
        profit_metric = "Net income"
        if profit is None:
            profit = row.get("quarterlyOperatingIncome")
            profit_metric = "Operating income"

        ebitda = row.get("quarterlyEBITDA")
        if ebitda is None:
            ebitda = row.get("quarterlyNormalizedEBITDA")

        previous = enriched[index - 1]["profit"] if index > 0 else None
        enriched.append({
            **row,
            "profit": profit,
            "profitMetric": profit_metric,
            "profitGrowthQoQ": pct_change(profit, previous),
            "capex": row.get("quarterlyCapitalExpenditure"),
            "operatingCashFlow": row.get("quarterlyOperatingCashFlow"),
            "freeCashFlow": row.get("quarterlyFreeCashFlow"),
            "operatingExpense": row.get("quarterlyOperatingExpense"),
            "ebitda": ebitda,
        })
    return enriched[-5:]


def build_company(company: dict) -> dict:
    try:
        quarters = enrich_quarters(fetch_fundamentals(company["symbol"]))
        status = "ok" if quarters else "no-data"
        message = "" if quarters else "Yahoo Finance fundamentals time-series returned no quarterly rows."
    except Exception as error:
        quarters = []
        status = "error"
        message = str(error)

    return {
        **company,
        "status": status,
        "message": message,
        "quarters": quarters,
        "valuation": {
            "trailingPE": None,
            "forwardPE": None,
            "priceToBook": None,
            "note": "무료 공개 quote/consensus 엔드포인트가 제한되어 1차 버전에서는 공란으로 둡니다.",
        },
        "consensus": {
            "epsNextQuarter": None,
            "revenueNextQuarter": None,
            "note": "컨센서스는 공식/유료 데이터 소스 연결 후 채울 예정입니다.",
        },
    }


def main() -> None:
    companies = [build_company(company) for company in COMPANIES]
    payload = {
        "ok": True,
        "generatedAt": datetime.now(tz=KST).isoformat(timespec="seconds"),
        "source": "Yahoo Finance fundamentals time-series public endpoint",
        "companies": companies,
        "sources": [
            {
                "title": "Yahoo Finance fundamentals time-series",
                "url": "https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/MSFT",
                "note": "분기 손익계산서와 현금흐름표 항목을 가져옵니다. 종목별 제공 범위가 다를 수 있습니다.",
            }
        ],
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT} for {len(companies)} companies")


if __name__ == "__main__":
    main()
