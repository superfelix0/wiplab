from __future__ import annotations

import csv
import json
import math
import os
import socket
import time
import urllib.error
import urllib.parse
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


def fred_api_url(series_id: str, api_key: str) -> str:
    params = urllib.parse.urlencode(
        {
            "series_id": series_id,
            "api_key": api_key,
            "file_type": "json",
            "sort_order": "asc",
            "limit": 100000,
        }
    )
    return f"https://api.stlouisfed.org/fred/series/observations?{params}"


def parse_fred_api_json(text: str, series: dict) -> list[dict]:
    payload = json.loads(text)
    rows = []
    for row in payload.get("observations", []):
        date = row.get("date")
        raw = row.get("value")
        try:
            value = float(raw) * series["scale"]
        except (TypeError, ValueError):
            continue
        if date and math.isfinite(value):
            rows.append({"date": date, "value": value})
    return rows


def parse_fred_csv(text: str, series: dict) -> list[dict]:
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


def fetch_observations(series: dict) -> tuple[list[dict], str]:
    last_error: Exception | None = None
    api_key = os.getenv("FRED_API_KEY", "").strip()
    sources = []
    if api_key:
        sources.append(("FRED API", fred_api_url(series["fredId"], api_key), parse_fred_api_json))
    sources.append(("FRED CSV", fred_csv_url(series["fredId"]), parse_fred_csv))

    for source_name, url, parser in sources:
        try:
            return fetch_observations_from_url(series, source_name, url, parser)
        except RuntimeError as error:
            last_error = error
            if source_name == "FRED API":
                print(f"FRED API fetch failed for {series['fredId']}; falling back to public CSV. Error: {error}", flush=True)

    raise RuntimeError(f"FRED fetch failed for {series['fredId']}: {last_error}")


def fetch_observations_from_url(series: dict, source_name: str, url: str, parser) -> tuple[list[dict], str]:
    last_error: Exception | None = None
    for attempt in range(1, 4):
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "wiplabs-us-liquidity-action/1.0"},
        )
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                text = response.read().decode("utf-8")
            break
        except (TimeoutError, socket.timeout, urllib.error.HTTPError, urllib.error.URLError) as error:
            last_error = error
            if attempt == 3:
                raise RuntimeError(f"{source_name} failed after {attempt} attempts: {error}") from error
            wait_seconds = attempt * 5
            print(f"{source_name} fetch retry {attempt}/3 for {series['fredId']} after error: {error}. Waiting {wait_seconds}s.", flush=True)
            time.sleep(wait_seconds)

    rows = parser(text, series)
    print(f"{source_name} fetched {len(rows)} observations for {series['fredId']}.", flush=True)
    return rows, source_name


def load_existing_series() -> dict[str, dict]:
    if not OUTPUT.exists():
        return {}
    try:
        payload = json.loads(OUTPUT.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return {item.get("id"): item for item in payload.get("series", []) if item.get("id")}


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


def build_series(series: dict, existing: dict[str, dict] | None = None) -> dict:
    existing = existing or {}
    try:
        observations, fetch_source = fetch_observations(series)
    except RuntimeError as error:
        cached = existing.get(series["id"])
        if not cached:
            raise
        print(f"Using cached US liquidity series for {series['id']} because live fetch failed: {error}")
        return {
            **cached,
            **series,
            "stale": True,
            "fetchSource": "cached",
            "fetchError": str(error),
        }

    if not observations:
        cached = existing.get(series["id"])
        if cached:
            print(f"Using cached US liquidity series for {series['id']} because live fetch returned no observations.")
            return {
                **cached,
                **series,
                "stale": True,
                "fetchSource": "cached",
                "fetchError": "FRED returned no observations",
            }
        raise RuntimeError(f"FRED returned no observations for {series['fredId']}")

    latest = observations[-1]
    lookback = find_lookback(observations, latest["date"])
    change = latest["value"] - lookback["value"]
    pct_change = None if lookback["value"] == 0 else change / lookback["value"]

    return {
        **series,
        "latest": latest,
        "lookback": lookback,
        "stale": False,
        "fetchSource": fetch_source,
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
    existing = load_existing_series()
    series_data = [build_series(series, existing) for series in SERIES]
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
