from __future__ import annotations

import json
import math
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
    "quarterlyTotalRevenue", "quarterlyNetIncome", "quarterlyOperatingIncome",
    "quarterlyOperatingCashFlow", "quarterlyCapitalExpenditure", "quarterlyFreeCashFlow",
    "quarterlyOperatingExpense", "quarterlyEBITDA", "quarterlyNormalizedEBITDA",
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
    quoted = urllib.parse.quote(symbol)
    return f"https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{quoted}?{params}"


def raw_value(item: dict) -> float | None:
    value = item.get("reportedValue", {}).get("raw")
    return float(value) if isinstance(value, (int, float)) else None


def fetch_fundamentals(symbol: str) -> list[dict]:
    request = urllib.request.Request(
        yahoo_timeseries_url(symbol),
        headers={"User-Agent": "Mozilla/5.0 wiplabs-ai-earnings/1.1"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        data = json.loads(response.read().decode("utf-8"))

    quarters: dict[str, dict] = {}
    for result in data.get("timeseries", {}).get("result", []):
        for metric in METRICS:
            for item in result.get(metric, []) or []:
                date = item.get("asOfDate")
                value = raw_value(item)
                if date and value is not None:
                    quarters.setdefault(date, {"date": date})[metric] = value
    return [quarters[key] for key in sorted(quarters)][-6:]


def fetch_price_history(symbol: str) -> list[dict]:
    """Daily closes used only for relative share-price trend comparisons."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range=1y&interval=1d"
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 wiplabs-ai-earnings/1.1"})
    with urllib.request.urlopen(request, timeout=15) as response:
        result = json.loads(response.read().decode("utf-8")).get("chart", {}).get("result", [])[0]
    timestamps = result.get("timestamp", []) or []
    closes = ((result.get("indicators", {}).get("quote", []) or [{}])[0]).get("close", []) or []
    points = []
    for timestamp, close in zip(timestamps, closes):
        if not isinstance(close, (int, float)):
            continue
        date = datetime.fromtimestamp(timestamp, tz=timezone.utc).date().isoformat()
        points.append({"date": date, "close": round(float(close), 6)})
    return points[-130:]


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
        ebitda = row.get("quarterlyEBITDA") or row.get("quarterlyNormalizedEBITDA")
        previous = enriched[index - 1]["profit"] if index else None
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


def ratio(numerator: float | None, denominator: float | None) -> float | None:
    if not isinstance(numerator, (int, float)) or not isinstance(denominator, (int, float)) or denominator == 0:
        return None
    return abs(numerator) / abs(denominator)


def signed_pct(value: float | None) -> str:
    return "N/A" if value is None else f"{value * 100:+.1f}%"


def plain_pct(value: float | None) -> str:
    return "N/A" if value is None else f"{value * 100:.1f}%"


def build_highlight(company: dict, quarters: list[dict]) -> dict | None:
    if not quarters:
        return None
    latest = quarters[-1]
    if company["group"] == "Hyperscaler":
        capex_ocf = ratio(latest.get("capex"), latest.get("operatingCashFlow"))
        capex_profit = ratio(latest.get("capex"), latest.get("profit")) if (latest.get("profit") or 0) > 0 else None
        if capex_ocf is None or capex_profit is None:
            read_ko, read_en = "투자 여력 판단에 필요한 데이터가 부족합니다", "More data is needed to assess spending capacity"
        elif capex_ocf <= 0.7 and capex_profit <= 0.9:
            read_ko, read_en = "영업현금흐름과 이익 안에서 투자 여력이 있습니다", "CAPEX remains well covered by operating cash flow and profit"
        elif capex_ocf <= 1.0 and capex_profit <= 1.2:
            read_ko, read_en = "투자 부담은 관리 가능한 범위입니다", "The investment burden remains manageable"
        else:
            read_ko, read_en = "현금흐름 또는 이익 대비 투자 부담을 관찰할 필요가 있습니다", "CAPEX pressure versus cash flow or profit needs monitoring"
        return {
            "quarterDate": latest.get("date"),
            "ko": f"CAPEX/OCF {plain_pct(capex_ocf)}, CAPEX/순이익 {plain_pct(capex_profit)}로 {read_ko}.",
            "en": f"CAPEX/OCF is {plain_pct(capex_ocf)} and CAPEX/net income is {plain_pct(capex_profit)}. {read_en}.",
        }

    previous = quarters[-2] if len(quarters) > 1 else None
    revenue_growth = pct_change(latest.get("quarterlyTotalRevenue"), previous.get("quarterlyTotalRevenue") if previous else None)
    op_growth = pct_change(latest.get("quarterlyOperatingIncome"), previous.get("quarterlyOperatingIncome") if previous else None)
    revenue = latest.get("quarterlyTotalRevenue")
    operating_income = latest.get("quarterlyOperatingIncome")
    op_margin = operating_income / revenue if isinstance(operating_income, (int, float)) and isinstance(revenue, (int, float)) and revenue else None
    direction_ko = "증가" if (op_growth or 0) >= 0 else "감소"
    direction_en = "increased" if (op_growth or 0) >= 0 else "decreased"
    return {
        "quarterDate": latest.get("date"),
        "ko": f"전분기 대비 매출 {signed_pct(revenue_growth)}, 영업이익 {signed_pct(op_growth)}({direction_ko}), 영업이익률 {signed_pct(op_margin)}입니다.",
        "en": f"Revenue changed {signed_pct(revenue_growth)} QoQ and operating profit {direction_en} by {signed_pct(op_growth)}; operating margin was {signed_pct(op_margin)}.",
    }


def price_return(history: list[dict], sessions: int) -> float | None:
    if len(history) < 2:
        return None
    latest = history[-1].get("close")
    base = history[max(0, len(history) - 1 - sessions)].get("close")
    if not isinstance(latest, (int, float)) or not isinstance(base, (int, float)) or base == 0:
        return None
    return latest / base - 1


def price_summary(history: list[dict]) -> dict:
    return {
        "latestDate": history[-1].get("date") if history else None,
        "latestClose": history[-1].get("close") if history else None,
        "return1m": price_return(history, 21),
        "return3m": price_return(history, 63),
        "return6m": price_return(history, 126),
    }


def stock_signal(companies: list[dict], group: str) -> dict:
    if group == "hyperscalers":
        rows = [company for company in companies if company["group"] == "Hyperscaler"]
    elif group in ("memoryAll", "all"):
        rows = companies if group == "all" else [company for company in companies if company["group"] != "Hyperscaler"]
    else:
        rows = [company for company in companies if company["group"] != "Hyperscaler" and company["id"] != "kioxia"]
    returns = [company.get("priceSummary", {}).get("return3m") for company in rows]
    valid = [value for value in returns if isinstance(value, (int, float))]
    average = sum(valid) / len(valid) if valid else None
    positive = sum(value > 0 for value in valid)
    if average is not None and average >= 0.10 and positive >= max(1, math.ceil(len(valid) * 0.6)):
        status, ko, en = "favorable", "우호적", "Supportive"
    elif average is not None and average <= -0.10 and positive <= len(valid) * 0.4:
        status, ko, en = "unfavorable", "비우호적", "Unfavorable"
    else:
        status, ko, en = "neutral", "중립", "Neutral"
    return {"status": status, "labelKo": ko, "labelEn": en, "averageReturn3m": average, "positiveCount": positive, "total": len(valid)}


def load_existing() -> dict:
    if not OUTPUT.exists():
        return {}
    try:
        return json.loads(OUTPUT.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def build_company(company: dict, cached: dict | None = None) -> dict:
    cached = cached or {}
    try:
        quarters = enrich_quarters(fetch_fundamentals(company["symbol"]))
        if not quarters:
            raise RuntimeError("Yahoo Finance fundamentals time-series returned no quarterly rows.")
        status, message = "ok", ""
    except Exception as error:
        quarters = cached.get("quarters", [])
        status = "cached" if quarters else "error"
        message = f"Live fetch failed; retained the latest saved data. {error}" if quarters else str(error)
    official_quarter = next((row for row in cached.get("quarters", []) if row.get("officialNote")), None)
    if official_quarter:
        quarters = [row for row in quarters if row.get("date") != official_quarter.get("date")] + [official_quarter]
        quarters = sorted(quarters, key=lambda row: row.get("date", ""))[-5:]
    official_highlight = cached.get("latestHighlight") if official_quarter and quarters and quarters[-1].get("date") == official_quarter.get("date") and cached.get("latestHighlight", {}).get("quarterDate") == official_quarter.get("date") else None
    try:
        price_history = fetch_price_history(company["symbol"])
        if not price_history:
            raise RuntimeError("Yahoo Finance chart endpoint returned no daily closes.")
    except Exception:
        price_history = cached.get("priceHistory", [])
    return {
        **company,
        "status": status,
        "message": message,
        "quarters": quarters,
        "latestQuarterDate": quarters[-1].get("date") if quarters else None,
        "latestHighlight": official_highlight or build_highlight(company, quarters),
        "priceHistory": price_history,
        "priceSummary": price_summary(price_history),
        "valuation": {
            "trailingPE": None, "forwardPE": None, "priceToBook": None,
            "note": "무료 공개 데이터만 사용하며, 밸류에이션 데이터는 별도 원천 연결 전까지 제공하지 않습니다.",
        },
        "consensus": {
            "epsNextQuarter": None, "revenueNextQuarter": None,
            "note": "컨센서스는 신뢰할 수 있는 공개 원천이 연결된 뒤 제공할 예정입니다.",
        },
    }


def main() -> None:
    existing = load_existing()
    cached_by_id = {company.get("id"): company for company in existing.get("companies", [])}
    companies = [build_company(company, cached_by_id.get(company["id"])) for company in COMPANIES]
    release_history = list(existing.get("releaseHistory", []))
    known_releases = {(item.get("companyId"), item.get("quarterDate")) for item in release_history}
    now = datetime.now(tz=KST).isoformat(timespec="seconds")
    for company in companies:
        old_latest = cached_by_id.get(company["id"], {}).get("latestQuarterDate")
        new_latest = company.get("latestQuarterDate")
        key = (company["id"], new_latest)
        if old_latest and new_latest and new_latest != old_latest and key not in known_releases:
            highlight = company.get("latestHighlight") or {}
            release_history.append({
                "companyId": company["id"], "companyName": company["name"], "group": company["group"],
                "previousQuarterDate": old_latest, "quarterDate": new_latest, "detectedAt": now,
                "highlightKo": highlight.get("ko", ""), "highlightEn": highlight.get("en", ""),
            })
    payload = {
        "ok": True,
        "generatedAt": now,
        "source": "Yahoo Finance fundamentals time-series public endpoint",
        "companies": companies,
        "stockSignals": {
            "hyperscalers": stock_signal(companies, "hyperscalers"),
            "memory": stock_signal(companies, "memory"),
            "memoryAll": stock_signal(companies, "memoryAll"),
            "all": stock_signal(companies, "all"),
        },
        "releaseHistory": release_history[-30:],
        "sources": [{
            "title": "Yahoo Finance fundamentals time-series",
            "url": "https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/MSFT",
            "note": "분기 손익계산서와 현금흐름 항목을 가져옵니다. 종목별 공개 범위와 회계 기준은 다를 수 있습니다.",
        }],
    }
    comparable_existing = {key: value for key, value in existing.items() if key != "generatedAt"}
    comparable_payload = {key: value for key, value in payload.items() if key != "generatedAt"}
    if comparable_existing == comparable_payload:
        print("No new quarter or earnings data changes detected.")
        return
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT} for {len(companies)} companies")


if __name__ == "__main__":
    main()
