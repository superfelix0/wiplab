"""Collect KOSPI close and individual net-buying data for WIP 3.

Output CSV schema:
date,close,indiv_krw

The script is designed for GitHub Actions. If the installed pykrx version
requires KRX login, set KRX_ID and KRX_PW as GitHub Actions secrets.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd
from pykrx import stock


def ymd(value: dt.date) -> str:
    return value.strftime("%Y%m%d")


def parse_args() -> argparse.Namespace:
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()
    default_end = today - dt.timedelta(days=1)
    default_start = default_end - dt.timedelta(days=620)

    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default=ymd(default_start), help="Start date as YYYYMMDD")
    parser.add_argument("--end", default=ymd(default_end), help="End date as YYYYMMDD. Defaults to the previous KST date.")
    parser.add_argument("--out", default="docs/data/kospi-sentiment.csv", help="Output CSV path")
    parser.add_argument("--meta-out", default="docs/data/kospi-sentiment-meta.json", help="Output metadata JSON path")
    return parser.parse_args()


def parse_ymd(value: str) -> dt.date:
    return dt.datetime.strptime(value, "%Y%m%d").date()


def fetch_kospi_close_from_yahoo(start: str, end: str) -> pd.DataFrame:
    start_date = parse_ymd(start)
    end_date = parse_ymd(end)
    period1 = int(dt.datetime.combine(start_date, dt.time.min, tzinfo=dt.timezone.utc).timestamp())
    period2 = int(dt.datetime.combine(end_date + dt.timedelta(days=1), dt.time.min, tzinfo=dt.timezone.utc).timestamp())
    params = urllib.parse.urlencode({
        "period1": period1,
        "period2": period2,
        "interval": "1d",
        "events": "history",
    })
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/%5EKS11?{params}"
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "wiplabs-kospi-sentiment/1.0",
            "Accept": "application/json",
        },
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))

    result = payload.get("chart", {}).get("result", [None])[0]
    timestamps = result.get("timestamp") if result else None
    closes = result.get("indicators", {}).get("quote", [{}])[0].get("close") if result else None

    if not timestamps or not closes:
        raise RuntimeError("KOSPI index data is empty. Yahoo Finance returned no ^KS11 rows.")

    rows = []
    for timestamp, close in zip(timestamps, closes):
        if close is None:
            continue
        date = dt.datetime.fromtimestamp(timestamp, tz=dt.timezone.utc).date()
        rows.append({"date": date.strftime("%Y-%m-%d"), "close": float(close)})

    df = pd.DataFrame(rows)
    if df.empty:
        raise RuntimeError("KOSPI index data is empty. Yahoo Finance returned only empty close values.")

    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").sort_index()
    return df


def collect(start: str, end: str) -> pd.DataFrame:
    print(f"Collecting KOSPI sentiment data: {start} ~ {end}")
    print(f"KRX_ID configured: {bool(os.getenv('KRX_ID'))}")
    print(f"KRX_PW configured: {bool(os.getenv('KRX_PW'))}")

    index_df = fetch_kospi_close_from_yahoo(start, end)
    print(f"KOSPI index rows: {len(index_df)}")

    flow_df = stock.get_market_trading_value_by_date(start, end, "KOSPI", on="순매수")
    print(f"KOSPI investor flow rows: {len(flow_df)}")

    if flow_df.empty:
        login_hint = " KRX_ID/KRX_PW GitHub Secrets를 확인하세요." if not os.getenv("KRX_ID") else ""
        raise RuntimeError(f"KOSPI investor flow data is empty. KRX returned no investor flow rows.{login_hint}")

    close = index_df[["close"]]

    if "개인" not in flow_df.columns:
        raise RuntimeError(f"Investor flow data does not include 개인 column: {list(flow_df.columns)}")

    flow = flow_df[["개인"]].rename(columns={"개인": "indiv_krw"})
    flow.index = pd.to_datetime(flow.index)
    merged = close.join(flow, how="inner").dropna().reset_index()

    date_col = merged.columns[0]
    merged = merged.rename(columns={date_col: "date"})
    merged["date"] = pd.to_datetime(merged["date"]).dt.strftime("%Y-%m-%d")
    merged["close"] = pd.to_numeric(merged["close"], errors="coerce")
    merged["indiv_krw"] = pd.to_numeric(merged["indiv_krw"], errors="coerce").round().astype("Int64")
    merged = merged[["date", "close", "indiv_krw"]].dropna()

    if len(merged) < 120:
        raise RuntimeError(f"Not enough observations: {len(merged)}")

    return merged


def main() -> None:
    args = parse_args()
    out = Path(args.out)
    meta_out = Path(args.meta_out)
    out.parent.mkdir(parents=True, exist_ok=True)
    meta_out.parent.mkdir(parents=True, exist_ok=True)

    df = collect(args.start, args.end)
    df.to_csv(out, index=False, encoding="utf-8")

    now_kst = dt.datetime.now(dt.timezone(dt.timedelta(hours=9)))
    meta = {
        "generatedAt": now_kst.isoformat(timespec="seconds"),
        "timezone": "Asia/Seoul",
        "source": "Yahoo Finance ^KS11 + pykrx KRX investor flow",
        "startDate": str(df.iloc[0]["date"]),
        "lastDataDate": str(df.iloc[-1]["date"]),
        "rowCount": int(len(df)),
    }
    meta_out.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {len(df)} rows to {out}. Last date: {df.iloc[-1]['date']}")
    print(f"Wrote metadata to {meta_out}. Generated at: {meta['generatedAt']}")


if __name__ == "__main__":
    main()
