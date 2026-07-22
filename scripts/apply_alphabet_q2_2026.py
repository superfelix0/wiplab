"""Apply Alphabet's official Q2 2026 release to the AI earnings dataset.

Source: https://s206.q4cdn.com/479360582/files/doc_financials/2026/q2/2026q2-alphabet-earnings-release.pdf
The script deliberately preserves the other companies' latest saved data.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

OUTPUT = Path("docs/data/ai-earnings.json")
KST = timezone(timedelta(hours=9))
SOURCE_URL = "https://s206.q4cdn.com/479360582/files/doc_financials/2026/q2/2026q2-alphabet-earnings-release.pdf"


def main() -> None:
    data = json.loads(OUTPUT.read_text(encoding="utf-8"))
    company = next(item for item in data["companies"] if item["id"] == "alphabet")
    quarter = {
        "date": "2026-06-30",
        "quarterlyTotalRevenue": 119_796_000_000,
        "quarterlyOperatingIncome": 40_770_000_000,
        "quarterlyNetIncome": 112_193_000_000,
        "quarterlyOperatingCashFlow": 39_069_000_000,
        "quarterlyCapitalExpenditure": -44_924_000_000,
        "quarterlyFreeCashFlow": -5_855_000_000,
        "quarterlyEBITDA": 47_874_000_000,
        "quarterlyNormalizedEBITDA": 47_874_000_000,
        "profit": 112_193_000_000,
        "profitMetric": "Net income (includes equity gain)",
        "profitGrowthQoQ": 112_193_000_000 / 62_578_000_000 - 1,
        "capex": -44_924_000_000,
        "operatingCashFlow": 39_069_000_000,
        "freeCashFlow": -5_855_000_000,
        "officialNote": "Q2 net income includes a $77.1B after-tax unrealized equity gain.",
    }
    company["quarters"] = [row for row in company.get("quarters", []) if row.get("date") != quarter["date"]]
    company["quarters"] = (company["quarters"] + [quarter])[-5:]
    company["latestQuarterDate"] = quarter["date"]
    company["latestHighlight"] = {
        "quarterDate": quarter["date"],
        "ko": "Q2 업데이트: 매출 $119.8B(+24% YoY), Google Cloud $24.8B(+82%). CAPEX $44.9B가 OCF $39.1B를 넘어 FCF는 -$5.9B입니다. 순이익에는 지분증권 이익이 포함됩니다.",
        "en": "Q2 update: revenue was $119.8B (+24% YoY) and Google Cloud reached $24.8B (+82%). $44.9B CAPEX exceeded $39.1B OCF, taking FCF to -$5.9B. Net income includes a large equity gain.",
    }
    now = datetime.now(KST).isoformat(timespec="seconds")
    history = data.setdefault("releaseHistory", [])
    if not any(row.get("companyId") == "alphabet" and row.get("quarterDate") == quarter["date"] for row in history):
        history.append({
            "companyId": "alphabet", "companyName": "Alphabet", "group": "Hyperscaler",
            "previousQuarterDate": "2026-03-31", "quarterDate": quarter["date"], "detectedAt": now,
            "highlightKo": company["latestHighlight"]["ko"], "highlightEn": company["latestHighlight"]["en"],
        })
    sources = data.setdefault("sources", [])
    if not any(row.get("url") == SOURCE_URL for row in sources):
        sources.append({
            "title": "Alphabet Q2 2026 earnings release (official)", "url": SOURCE_URL,
            "note": "Official release dated July 22, 2026. Q2 figures are in USD millions; CAPEX is purchases of property and equipment.",
        })
    data["generatedAt"] = now
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Applied Alphabet official Q2 2026 earnings release.")


if __name__ == "__main__":
    main()
