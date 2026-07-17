"""Update KOSPI PER history and build WIP 2 market PER JSON.

The long history is maintained in ``docs/data/kospi-per-history.csv``.
Seed data can be supplied manually, and this script appends the latest KRX
daily KOSPI PER observation when a newer trading day is available.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import time
from pathlib import Path

import pandas as pd
from pykrx import stock


KST = dt.timezone(dt.timedelta(hours=9))
TARGET_NAME = "코스피"
DEFAULT_HISTORY = Path("docs/data/kospi-per-history.csv")


def ymd(value: dt.date) -> str:
    return value.strftime("%Y%m%d")


def parse_ymd(value: str) -> dt.date:
    return dt.datetime.strptime(value, "%Y%m%d").date()


def parse_args() -> argparse.Namespace:
    today = dt.datetime.now(KST).date()

    parser = argparse.ArgumentParser()
    parser.add_argument("--end", default=ymd(today), help="Latest date to try as YYYYMMDD")
    parser.add_argument("--history", default=str(DEFAULT_HISTORY), help="Accumulated KOSPI PER CSV path")
    parser.add_argument("--out", default="docs/data/market-per.json", help="Output JSON path")
    parser.add_argument("--lookback-days", type=int, default=14, help="Days to look back for the latest KRX trading day")
    return parser.parse_args()


def normalize_float(value) -> float | None:
    if pd.isna(value):
        return None

    text = str(value).replace(",", "").strip()
    if not text or text == "-":
        return None

    try:
        parsed = float(text)
    except ValueError:
        return None

    return parsed if parsed > 0 else None


def normalize_date(value) -> str:
    return pd.to_datetime(str(value).strip().replace(".", "/")).strftime("%Y-%m-%d")


def find_index_row(df: pd.DataFrame):
    if df.empty:
        return None, None

    for index_name, row in df.iterrows():
        name = str(index_name)
        if name.replace(" ", "") == TARGET_NAME.replace(" ", ""):
            return name, row

    for index_name, row in df.iterrows():
        name = str(index_name)
        if TARGET_NAME in name:
            return name, row

    return None, None


def fetch_kospi_per_for_date(date_str: str) -> dict | None:
    try:
        df = stock.get_index_fundamental_by_ticker(date_str, market="KOSPI", alternative=True)
    except TypeError:
        df = stock.get_index_fundamental_by_ticker(date_str, market="KOSPI")
    except Exception as error:
        print(f"KOSPI PER skipped for {date_str}: {error}")
        return None

    name, row = find_index_row(df)
    if row is None:
        return None

    per = normalize_float(row.get("PER"))
    if per is None:
        return None

    return {
        "date": pd.to_datetime(date_str).strftime("%Y-%m-%d"),
        "name": name,
        "close": normalize_float(row.get("종가")),
        "per": per,
        "pbr": normalize_float(row.get("PBR")),
        "dividendYield": normalize_float(row.get("배당수익률")),
    }


def fetch_latest_kospi_per(end: str, lookback_days: int) -> dict | None:
    end_date = parse_ymd(end)
    print(f"Fetching latest KRX KOSPI PER up to {end}")
    print(f"KRX_ID configured: {bool(os.getenv('KRX_ID'))}")
    print(f"KRX_PW configured: {bool(os.getenv('KRX_PW'))}")

    for offset in range(lookback_days + 1):
        date = end_date - dt.timedelta(days=offset)
        if date.weekday() >= 5:
            continue

        row = fetch_kospi_per_for_date(ymd(date))
        if row:
            return row

        time.sleep(0.05)

    return None


def load_history(path: Path) -> list[dict]:
    if not path.exists():
        return []

    df = pd.read_csv(path)
    rows = []
    for _, row in df.iterrows():
        per = normalize_float(row.get("per") or row.get("PER"))
        if per is None:
            continue
        rows.append({
            "date": normalize_date(row.get("date") or row.get("일자")),
            "name": row.get("name") or TARGET_NAME,
            "close": normalize_float(row.get("close") or row.get("종가")),
            "per": per,
            "pbr": normalize_float(row.get("pbr") or row.get("PBR")),
            "dividendYield": normalize_float(row.get("dividendYield") or row.get("배당수익률")),
        })

    return sorted(rows, key=lambda item: item["date"])


def merge_rows(history_rows: list[dict], new_row: dict | None) -> list[dict]:
    by_date = {row["date"]: row for row in history_rows}
    if new_row:
        by_date[new_row["date"]] = new_row
    return [by_date[date] for date in sorted(by_date)]


def write_history(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(rows, columns=["date", "name", "close", "per", "pbr", "dividendYield"])
    df.to_csv(path, index=False, encoding="utf-8")


def build_payload(rows: list[dict]) -> dict:
    if not rows:
        raise RuntimeError("KOSPI PER history is empty.")

    latest = rows[-1]
    average = sum(row["per"] for row in rows) / len(rows)

    return {
        "generatedAt": dt.datetime.now(KST).isoformat(timespec="seconds"),
        "timezone": "Asia/Seoul",
        "source": "user-provided KRX KOSPI PER CSV + pykrx KRX daily index fundamentals",
        "markets": {
            "kospi200": {
                "name": "KOSPI",
                "krxName": latest.get("name") or TARGET_NAME,
                "date": latest["date"],
                "close": latest.get("close"),
                "per": latest["per"],
                "pbr": latest.get("pbr"),
                "dividendYield": latest.get("dividendYield"),
                "historicalAveragePer": round(average, 2),
                "historicalAverageStart": rows[0]["date"],
                "historicalAverageEnd": rows[-1]["date"],
                "observationCount": len(rows),
                "history": [{"date": row["date"], "per": row["per"]} for row in rows],
            }
        },
    }


def main() -> None:
    args = parse_args()
    history_path = Path(args.history)
    out = Path(args.out)

    history_rows = load_history(history_path)
    latest_row = fetch_latest_kospi_per(args.end, args.lookback_days)
    rows = merge_rows(history_rows, latest_row)

    if latest_row:
        previous_count = len(history_rows)
        print(f"Latest KOSPI PER row: {latest_row['date']} PER {latest_row['per']}")
        print(f"History rows: {previous_count} -> {len(rows)}")
    else:
        print("No newer KRX KOSPI PER row found. Rebuilding JSON from existing history.")

    write_history(history_path, rows)

    out.parent.mkdir(parents=True, exist_ok=True)
    payload = build_payload(rows)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    latest = rows[-1]
    print(f"Wrote {out}. Last date: {latest['date']}, PER: {latest['per']}, average: {payload['markets']['kospi200']['historicalAveragePer']}")


if __name__ == "__main__":
    main()
