from __future__ import annotations

import csv
import json
import math
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path


KST = timezone(timedelta(hours=9))
OUTPUT = Path("docs/data/us-liquidity.json")

SERIES = [
    {
        "id": "m2",
        "fredId": "M2SL",
        "label": "M2 통화량",
        "shortLabel": "M2",
        "unit": "십억 달러",
        "scale": 1,
        "positiveWhen": "up",
        "sourceUrl": "https://fred.stlouisfed.org/series/M2SL",
        "note": "가계와 기업이 보유한 넓은 의미의 통화량입니다. 늘어나면 거시 유동성에는 우호적으로 봅니다.",
    },
    {
        "id": "reserves",
        "fredId": "WRESBAL",
        "label": "지급준비금",
        "shortLabel": "Reserves",
        "unit": "십억 달러",
        "scale": 0.001,
        "positiveWhen": "up",
        "sourceUrl": "https://fred.stlouisfed.org/series/WRESBAL",
        "note": "은행이 연준에 보유한 준비금입니다. 늘어나면 은행 시스템 내 유동성 여유가 커지는 방향입니다.",
    },
    {
        "id": "rrp",
        "fredId": "RRPONTSYD",
        "label": "역레포(RRP)",
        "shortLabel": "RRP",
        "unit": "십억 달러",
        "scale": 1,
        "positiveWhen": "down",
        "sourceUrl": "https://fred.stlouisfed.org/series/RRPONTSYD",
        "note": "단기 자금이 연준 역레포에 머무는 규모입니다. 줄어들면 시장으로 풀릴 수 있는 돈이 늘어나는 방향입니다.",
    },
    {
        "id": "tga",
        "fredId": "WTREGEN",
        "label": "재무부 일반계정(TGA)",
        "shortLabel": "TGA",
        "unit": "십억 달러",
        "scale": 0.001,
        "positiveWhen": "down",
        "sourceUrl": "https://fred.stlouisfed.org/series/WTREGEN",
        "note": "미 재무부의 연준 예금 잔고입니다. 늘어나면 민간·은행 시스템에서 돈을 흡수하는 방향으로 봅니다.",
    },
]


def fred_csv_url(series_id: str) -> str:
    return f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"


def fetch_observations(series: dict) -> list[dict]:
    req = urllib.request.Request(
        fred_csv_url(series["fredId"]),
        headers={"User-Agent": "wiplabs-us-liquidity-action/1.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        text = response.read().decode("utf-8")

    rows = []
    for row in csv.DictReader(text.splitlines()):
        date = row.get("observation_date") or row.get("DATE")
        raw = row.get(series["fredId"])
        try:
            value = float(raw) * series["scale"]
        except (TypeError, ValueError):
            continue
        if date and math.isfinite(value):
            rows.append({"date": date, "value": value})
    return rows


def find_lookback(observations: list[dict], latest_date: str, days: int = 90) -> dict:
    cutoff = (datetime.fromisoformat(latest_date) - timedelta(days=days)).date().isoformat()
    candidate = observations[0]
    for row in observations:
        if row["date"] <= cutoff:
            candidate = row
        else:
            break
    return candidate


def build_signal(series: dict, latest: dict, previous: dict) -> dict:
    change = latest["value"] - previous["value"]
    favorable = change >= 0 if series["positiveWhen"] == "up" else change <= 0
    return {
        "favorable": favorable,
        "direction": "증가" if change >= 0 else "감소",
        "tone": "positive" if favorable else "negative",
    }


def build_series(series: dict) -> dict:
    observations = fetch_observations(series)
    latest = observations[-1]
    lookback = find_lookback(observations, latest["date"])
    change = latest["value"] - lookback["value"]
    pct_change = None if lookback["value"] == 0 else change / lookback["value"]

    return {
        **series,
        "latest": latest,
        "lookback": lookback,
        "stale": False,
        "fetchError": "",
        "change": change,
        "pctChange": pct_change,
        "signal": build_signal(series, latest, lookback),
        "observations": observations[-520:],
    }


def build_summary(series_data: list[dict]) -> dict:
    positives = sum(1 for item in series_data if item["signal"]["favorable"])
    reserve = next(item for item in series_data if item["id"] == "reserves")
    rrp = next(item for item in series_data if item["id"] == "rrp")
    tga = next(item for item in series_data if item["id"] == "tga")

    latest_market_liquidity = reserve["latest"]["value"] - rrp["latest"]["value"] - tga["latest"]["value"]
    lookback_market_liquidity = reserve["lookback"]["value"] - rrp["lookback"]["value"] - tga["lookback"]["value"]

    label = "혼재"
    tone = "neutral"
    description = "일부 지표는 우호적이고 일부 지표는 긴축적입니다. 방향성이 아직 한쪽으로 선명하지 않습니다."

    if positives >= 3:
        label = "유동성 우호"
        tone = "positive"
        description = "최근 약 3개월 기준으로 다수 지표가 시장 유동성에 우호적인 방향입니다."
    elif positives <= 1:
        label = "유동성 긴축"
        tone = "negative"
        description = "최근 약 3개월 기준으로 다수 지표가 시장 유동성에 부담을 주는 방향입니다."

    return {
        "label": label,
        "tone": tone,
        "positives": positives,
        "total": len(series_data),
        "description": description,
        "marketLiquidity": {
            "label": "실질 유동성 보조값",
            "formula": "지급준비금 - RRP - TGA",
            "latest": latest_market_liquidity,
            "lookback": lookback_market_liquidity,
            "change": latest_market_liquidity - lookback_market_liquidity,
        },
    }


def main() -> None:
    series_data = [build_series(series) for series in SERIES]
    payload = {
        "ok": True,
        "fetchedAt": int(datetime.now(tz=KST).timestamp() * 1000),
        "generatedAt": datetime.now(tz=KST).isoformat(timespec="seconds"),
        "lookbackDays": 90,
        "summary": build_summary(series_data),
        "series": series_data,
        "sources": [
            {"fredId": item["fredId"], "label": item["label"], "sourceUrl": item["sourceUrl"]}
            for item in SERIES
        ],
        "disclaimer": "FRED 공개 시계열을 조합한 참고용 실험 화면이며 투자 권유가 아닙니다.",
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(series_data)} series")


if __name__ == "__main__":
    main()
