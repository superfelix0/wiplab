"""Append the latest KRX foreign spot/futures flow to the F8 data file.

KRX's public home-page summary exposes the previous business day's investor
trading value for KOSPI spot and KOSPI 200 futures. Values are published in
KRW billions. Re-running this script on weekends or holidays is safe because
rows are merged by the KRX trading date.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path


KST = dt.timezone(dt.timedelta(hours=9))
KRX_URL = (
    "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd"
    "?bld=dbms/MDC/MAIN/MDCMAIN00103"
)
KRX_HOME = "https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="docs/data/foreign-flow-pulse.json")
    parser.add_argument("--keep", type=int, default=260, help="Maximum stored trading sessions")
    return parser.parse_args()


def fetch_market_summary(field: str, value: str) -> dict:
    body = urllib.parse.urlencode({field: value}).encode("utf-8")
    request = urllib.request.Request(
        KRX_URL,
        data=body,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; WIPLabs-F8/1.0)",
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Referer": KRX_HOME,
        },
        method="POST",
    )

    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                payload = json.loads(response.read().decode("utf-8"))
            rows = payload.get("output") or []
            foreign = next((row for row in rows if "외국인" in str(row.get("INVST_TP", ""))), None)
            if not foreign:
                raise RuntimeError("KRX response did not contain a foreign-investor row")
            return foreign
        except Exception as error:  # network retry for scheduled jobs
            last_error = error
            if attempt < 3:
                print(f"KRX F8 fetch retry {attempt}/3 after error: {error}")
                time.sleep(attempt * 5)
    raise RuntimeError(f"KRX F8 fetch failed after 3 attempts: {last_error}")


def number(value: object) -> float:
    return float(str(value).replace(",", "").strip())


def load_existing(path: Path) -> dict:
    if not path.exists():
        return {"rows": []}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {"rows": []}
    except Exception as error:
        print(f"Existing F8 data skipped: {error}")
        return {"rows": []}


def main() -> None:
    args = parse_args()
    out = Path(args.out)
    spot = fetch_market_summary("mktId", "STK")
    futures = fetch_market_summary("prodId", "KR___FUK2I")

    spot_date = str(spot.get("TRD_DD", ""))
    futures_date = str(futures.get("TRD_DD", ""))
    if len(spot_date) != 8 or spot_date != futures_date:
        raise RuntimeError(f"KRX spot/futures dates do not match: {spot_date} / {futures_date}")

    row = {
        "date": dt.datetime.strptime(spot_date, "%Y%m%d").date().isoformat(),
        # KRX publishes KRW billions; the page displays KRW trillions.
        "spot": round(number(spot.get("NETBID_TRDVAL")) / 1000, 4),
        "futures": round(number(futures.get("NETBID_TRDVAL")) / 1000, 4),
    }

    existing = load_existing(out)
    indexed = {
        str(item.get("date")): {
            "date": str(item.get("date")),
            "spot": float(item.get("spot", 0)),
            "futures": float(item.get("futures", 0)),
        }
        for item in existing.get("rows", [])
        if isinstance(item, dict) and item.get("date")
    }
    indexed[row["date"]] = row
    rows = sorted(indexed.values(), key=lambda item: item["date"])[-max(5, args.keep) :]

    payload = {
        "ok": True,
        "generatedAt": dt.datetime.now(KST).isoformat(timespec="seconds"),
        "lastDataDate": row["date"],
        "unit": "KRW trillion",
        "isSample": False,
        "source": {
            "name": "KRX Data Marketplace — previous-business-day investor trading trend",
            "url": KRX_HOME,
            "spot": "KOSPI foreign-investor net trading value",
            "futures": "KOSPI 200 futures foreign-investor net trading value",
            "note": "KRX source values are converted from KRW billions to KRW trillions.",
        },
        "rows": rows,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out} with {len(rows)} row(s); latest={row}")


if __name__ == "__main__":
    main()
