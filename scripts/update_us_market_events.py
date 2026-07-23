"""Collect upcoming watchlist earnings from Nasdaq's public calendar.

The endpoint is a free, unauthenticated website API. It can be rate-limited or
temporarily unavailable, so this script preserves the last valid JSON rather
than publishing invented dates or an empty successful response.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

OUTPUT = Path("docs/data/us-market-events.json")
WATCHLIST = {
    "MSFT": "Microsoft", "AAPL": "Apple", "AMZN": "Amazon", "GOOGL": "Alphabet",
    "META": "Meta", "NVDA": "NVIDIA", "TSM": "TSMC", "AVGO": "Broadcom",
}
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nasdaq.com/market-activity/earnings",
    "Origin": "https://www.nasdaq.com",
}


def fetch_for(day: date) -> list[dict]:
    query = urlencode({"date": day.isoformat()})
    request = Request(f"https://api.nasdaq.com/api/calendar/earnings?{query}", headers=HEADERS)
    with urlopen(request, timeout=25) as response:  # nosec B310 - fixed https host
        payload = json.load(response)
    return payload.get("data", {}).get("rows", []) or []


def normalize(row: dict, day: date) -> dict | None:
    symbol = str(row.get("symbol") or row.get("ticker") or "").upper().strip()
    if symbol not in WATCHLIST:
        return None
    return {
        "symbol": symbol,
        "name": WATCHLIST[symbol],
        "date": day.isoformat(),
        "time": row.get("time") or row.get("timeOfDay") or "Not specified",
        "source": "Nasdaq Earnings Calendar",
    }


def main() -> None:
    collected: list[dict] = []
    failures: list[str] = []
    successful_days = 0
    today = date.today()
    for offset in range(14):
        day = today + timedelta(days=offset)
        if day.weekday() >= 5:
            continue
        try:
            rows = fetch_for(day)
            successful_days += 1
        except Exception as error:  # Keep partial successful calendar data; fail only if every request fails.
            failures.append(f"{day.isoformat()}: {error}")
            continue
        for row in rows:
            event = normalize(row, day)
            if event:
                collected.append(event)
    if not successful_days:
        raise RuntimeError("Nasdaq Earnings Calendar returned no successful daily responses")
    unique = {(event["symbol"], event["date"]): event for event in collected}
    payload = {
        "ok": True,
        "generatedAt": datetime.now(timezone.utc).astimezone().isoformat(),
        "source": "Nasdaq Earnings Calendar public endpoint",
        "events": sorted(unique.values(), key=lambda item: (item["date"], item["symbol"])),
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(payload['events'])} watchlist events from {successful_days} calendar days")
    if failures:
        print("Calendar days skipped after request errors: " + "; ".join(failures))


if __name__ == "__main__":
    main()
