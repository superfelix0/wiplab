"""Collect KRX index PER data for WIP 2.

Output JSON schema:
{
  "generatedAt": "...",
  "timezone": "Asia/Seoul",
  "source": "pykrx KRX index fundamentals",
  "markets": {
    "kospi200": {
      "name": "KOSPI 200",
      "date": "YYYY-MM-DD",
      "per": 0.0,
      "historicalAveragePer": 0.0,
      "history": [{"date": "YYYY-MM-DD", "per": 0.0}]
    }
  }
}
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
TARGET_NAME = "코스피 200"


def ymd(value: dt.date) -> str:
    return value.strftime("%Y%m%d")


def parse_ymd(value: str) -> dt.date:
    return dt.datetime.strptime(value, "%Y%m%d").date()


def parse_args() -> argparse.Namespace:
    today = dt.datetime.now(KST).date()
    default_end = today
    default_start = default_end - dt.timedelta(days=370)

    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default=ymd(default_start), help="Start date as YYYYMMDD")
    parser.add_argument("--end", default=ymd(default_end), help="End date as YYYYMMDD")
    parser.add_argument("--out", default="docs/data/market-per.json", help="Output JSON path")
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


def find_index_row(df: pd.DataFrame):
    if df.empty:
        return None, None

    for index_name, row in df.iterrows():
        name = str(index_name)
        normalized = name.replace(" ", "")
        if normalized == TARGET_NAME.replace(" ", ""):
            return name, row

    for index_name, row in df.iterrows():
        name = str(index_name)
        if TARGET_NAME in name:
            return name, row

    return None, None


def fetch_kospi200_per_for_date(date_str: str) -> dict | None:
    try:
        df = stock.get_index_fundamental_by_ticker(date_str, market="KOSPI", alternative=True)
    except TypeError:
        df = stock.get_index_fundamental_by_ticker(date_str, market="KOSPI")
    except Exception as error:
        print(f"KOSPI 200 PER skipped for {date_str}: {error}")
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
        "per": per,
    }


def discover_kospi200_ticker(end: str) -> str | None:
    candidates = ["1028", "2001"]

    for ticker in candidates:
        try:
            name = stock.get_index_ticker_name(ticker)
        except Exception:
            continue

        if TARGET_NAME.replace(" ", "") in str(name).replace(" ", ""):
            return ticker

    try:
        tickers = stock.get_index_ticker_list(end, market="KOSPI")
    except Exception as error:
        print(f"KOSPI 200 ticker discovery skipped: {error}")
        return None

    for ticker in tickers:
        try:
            name = stock.get_index_ticker_name(ticker)
        except Exception:
            continue

        if TARGET_NAME.replace(" ", "") in str(name).replace(" ", ""):
            print(f"Discovered KOSPI 200 ticker: {ticker} {name}")
            return ticker

    return None


def collect_by_date_api(start: str, end: str) -> list[dict]:
    ticker = discover_kospi200_ticker(end)
    if not ticker:
        return []

    try:
        df = stock.get_index_fundamental_by_date(start, end, ticker)
    except Exception as error:
        print(f"KOSPI 200 PER by-date API skipped for {ticker}: {error}")
        return []

    if df.empty or "PER" not in df.columns:
        return []

    rows = []
    for date, row in df.sort_index().iterrows():
        per = normalize_float(row.get("PER"))
        if per is None:
            continue

        rows.append({
            "date": pd.to_datetime(date).strftime("%Y-%m-%d"),
            "name": TARGET_NAME,
            "per": per,
        })

    print(f"KOSPI 200 PER by-date rows: {len(rows)}")
    return rows


def collect(start: str, end: str) -> list[dict]:
    start_date = parse_ymd(start)
    end_date = parse_ymd(end)
    rows = []
    total_days = (end_date - start_date).days + 1

    print(f"Collecting KRX KOSPI 200 PER: {start} ~ {end}")
    print(f"KRX_ID configured: {bool(os.getenv('KRX_ID'))}")
    print(f"KRX_PW configured: {bool(os.getenv('KRX_PW'))}")

    rows = collect_by_date_api(start, end)
    if rows:
        return rows

    print("Falling back to daily KRX PER table lookup.")
    for index, offset in enumerate(range(total_days), start=1):
        date = start_date + dt.timedelta(days=offset)
        if date.weekday() >= 5:
            continue

        row = fetch_kospi200_per_for_date(ymd(date))
        if row:
            rows.append(row)

        if index % 30 == 0 or offset == total_days - 1:
            print(f"  progress: {index}/{total_days} days, rows: {len(rows)}")

        time.sleep(0.05)

    if len(rows) < 20:
        raise RuntimeError(f"Not enough KOSPI 200 PER observations: {len(rows)}")

    return rows


def main() -> None:
    args = parse_args()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    rows = collect(args.start, args.end)
    latest = rows[-1]
    average = sum(row["per"] for row in rows) / len(rows)

    payload = {
        "generatedAt": dt.datetime.now(KST).isoformat(timespec="seconds"),
        "timezone": "Asia/Seoul",
        "source": "pykrx KRX index fundamentals",
        "markets": {
            "kospi200": {
                "name": "KOSPI 200",
                "krxName": latest["name"],
                "date": latest["date"],
                "per": latest["per"],
                "historicalAveragePer": round(average, 2),
                "history": [{"date": row["date"], "per": row["per"]} for row in rows],
            }
        },
    }

    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote KOSPI 200 PER data to {out}. Last date: {latest['date']}, PER: {latest['per']}")


if __name__ == "__main__":
    main()
