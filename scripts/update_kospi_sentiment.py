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
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd
from pykrx import stock
from pykrx.website.krx.future import core as krx_future_core


KST = dt.timezone(dt.timedelta(hours=9))


def ymd(value: dt.date) -> str:
    return value.strftime("%Y%m%d")


def parse_args() -> argparse.Namespace:
    today = dt.datetime.now(KST).date()
    default_end = today
    default_start = default_end - dt.timedelta(days=620)

    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default=ymd(default_start), help="Start date as YYYYMMDD")
    parser.add_argument(
        "--end",
        default=ymd(default_end),
        help="End date as YYYYMMDD. Defaults to the current KST date; non-trading dates are naturally skipped by the data join.",
    )
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
    params = urllib.parse.urlencode(
        {
            "period1": period1,
            "period2": period2,
            "interval": "1d",
            "events": "history",
        }
    )
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
    return df.set_index("date").sort_index()


def date_chunks(start: str, end: str, chunk_days: int = 180):
    current = parse_ymd(start)
    final = parse_ymd(end)

    while current <= final:
        chunk_end = min(current + dt.timedelta(days=chunk_days - 1), final)
        yield ymd(current), ymd(chunk_end)
        current = chunk_end + dt.timedelta(days=1)


def fetch_investor_flow_chunked(start: str, end: str) -> pd.DataFrame:
    """Fetch daily investor net-buying trend through pykrx's date-by-date API."""
    frames = []

    for chunk_start, chunk_end in date_chunks(start, end):
        print(f"Fetching KOSPI investor flow chunk: {chunk_start} ~ {chunk_end}")
        chunk = stock.get_market_trading_value_by_date(chunk_start, chunk_end, "KOSPI")

        if chunk.empty:
            chunk = stock.get_market_trading_value_by_date(
                chunk_start,
                chunk_end,
                "KOSPI",
                etf=True,
                etn=True,
                elw=True,
            )

        print(f"  chunk rows: {len(chunk)}")
        if not chunk.empty:
            frames.append(chunk)

    if not frames:
        return pd.DataFrame()

    combined = pd.concat(frames).sort_index()
    return combined[~combined.index.duplicated(keep="last")]


def normalize_number(value) -> int | None:
    if pd.isna(value):
        return None
    return int(str(value).replace(",", "").strip())


def normalize_float(value) -> float | None:
    if pd.isna(value):
        return None
    try:
        return float(str(value).replace(",", "").strip())
    except ValueError:
        return None


def fetch_personal_net_buy_for_date(date_str: str) -> int | None:
    """Fetch 개인 순매수 for one trading date through pykrx's investor aggregate API."""
    attempts = [
        {},
        {"etf": True, "etn": True, "elw": True},
    ]

    for kwargs in attempts:
        df = stock.get_market_trading_value_by_investor(date_str, date_str, "KOSPI", **kwargs)
        if df.empty:
            continue
        if "개인" in df.index and "순매수" in df.columns:
            return normalize_number(df.loc["개인", "순매수"])

    return None


def fetch_investor_flow_daily_from_investor_api(trading_dates) -> pd.DataFrame:
    """Reconstruct the daily 개인 series if pykrx's date-by-date trend API returns empty rows."""
    rows = []
    missing = []
    dates = pd.to_datetime(trading_dates).sort_values()

    print("Falling back to get_market_trading_value_by_investor per trading date.")
    for idx, date in enumerate(dates, start=1):
        date_str = date.strftime("%Y%m%d")
        value = fetch_personal_net_buy_for_date(date_str)

        if value is None:
            missing.append(date_str)
        else:
            rows.append({"date": date, "개인": value})

        if idx % 25 == 0 or idx == len(dates):
            print(f"  fallback progress: {idx}/{len(dates)} dates, rows: {len(rows)}")

        time.sleep(0.08)

    if missing:
        preview = ", ".join(missing[:8])
        suffix = "..." if len(missing) > 8 else ""
        print(f"  missing investor flow dates: {len(missing)} ({preview}{suffix})")

    if not rows:
        return pd.DataFrame()

    return pd.DataFrame(rows).set_index("date").sort_index()


def is_volatility_index_name(name: str) -> bool:
    normalized = str(name).replace(" ", "").replace("-", "").upper()
    return (
        "VKOSPI" in normalized
        or ("변동성" in str(name) and ("200" in str(name) or "코스피" in str(name)))
    )


def volatility_result(name: str, date: str, value, ticker: str | None = None) -> dict | None:
    parsed = normalize_float(value)
    if parsed is None or parsed <= 0:
        return None

    return {
        "name": str(name),
        "ticker": str(ticker or ""),
        "date": date,
        "value": parsed,
        "source": "pykrx KRX index",
    }


def get_krx_future_fetcher(bld: str):
    for item_name in dir(krx_future_core):
        item = getattr(krx_future_core, item_name)
        if not isinstance(item, type):
            continue

        try:
            instance = item()
        except Exception:
            continue

        if getattr(instance, "bld", None) == bld and hasattr(instance, "fetch"):
            return instance

    return None


def fetch_vkospi_spot_from_futures_table(end: str) -> dict | None:
    fetcher = get_krx_future_fetcher("dbms/MDC/STAT/standard/MDCSTAT12501")
    if fetcher is None:
        print("V-KOSPI futures fetcher unavailable.")
        return None

    for date_str in [ymd(parse_ymd(end) - dt.timedelta(days=offset)) for offset in range(0, 15)]:
        try:
            df = fetcher.fetch(date_str, "KRDRVFUVKI")
        except Exception as error:
            print(f"V-KOSPI futures table skipped for {date_str}: {error}")
            continue

        if df.empty or "SPOT_PRC" not in df.columns:
            continue

        for _, row in df.iterrows():
            result = volatility_result("KOSPI 200 Volatility Index (VKOSPI)", pd.to_datetime(date_str).strftime("%Y-%m-%d"), row.get("SPOT_PRC"), "KRDRVFUVKI")
            if result:
                result["source"] = "pykrx KRX V-KOSPI futures table"
                print(f"KOSPI 200 volatility index from V-KOSPI futures: {result['date']} {result['value']}")
                return result

    return None


def fetch_kospi_volatility_from_news() -> dict | None:
    """Fallback when KRX does not expose a usable VKOSPI spot value."""
    url = "https://www.marketwatch.com/story/turbo-charged-sk-hynix-volatility-shows-no-sign-of-abating-as-ai-euphoria-swings-to-fatigue-f5a5b95b"
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 wiplabs-kospi-sentiment/1.0",
            "Accept": "text/html,application/xhtml+xml",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            html = response.read().decode("utf-8", errors="ignore")
    except Exception as error:
        print(f"MarketWatch KOSPI volatility fallback failed: {error}")
        return None

    match = re.search(r"Kospi index volatility stands at\s+([0-9]+(?:\.[0-9]+)?)", html, flags=re.IGNORECASE)
    if not match:
        print("MarketWatch KOSPI volatility fallback pattern not found.")
        return None

    result = volatility_result("KOSPI index volatility", dt.datetime.now(KST).date().isoformat(), match.group(1), "MarketWatch")
    if result:
        result["source"] = "MarketWatch article"
        result["sourceUrl"] = url
        print(f"KOSPI volatility fallback from MarketWatch: {result['date']} {result['value']}")

    return result


def fetch_kospi200_volatility(end: str) -> dict | None:
    """Fetch the latest KOSPI 200 volatility index value from KRX index tables."""
    markets = ("KOSPI", "KRX", "테마")
    search_dates = [ymd(parse_ymd(end) - dt.timedelta(days=offset)) for offset in range(0, 15)]

    vkospi_spot = fetch_vkospi_spot_from_futures_table(end)
    if vkospi_spot:
        return vkospi_spot

    for date_str in search_dates:
        for market in markets:
            try:
                daily = stock.get_index_ohlcv_by_ticker(date_str, market=market, alternative=True)
            except Exception as error:
                print(f"KOSPI 200 volatility daily table skipped for {market} {date_str}: {error}")
                continue

            if daily.empty:
                continue

            for index_name, row in daily.iterrows():
                if not is_volatility_index_name(str(index_name)):
                    continue

                result = volatility_result(str(index_name), pd.to_datetime(date_str).strftime("%Y-%m-%d"), row.get("종가"))
                if result:
                    print(f"KOSPI 200 volatility index: {result['name']} {result['date']} {result['value']}")
                    return result

    try:
        for market in markets:
            try:
                tickers = stock.get_index_ticker_list(end, market=market)
            except Exception as error:
                print(f"KOSPI 200 volatility ticker lookup skipped for {market}: {error}")
                continue

            for ticker in tickers:
                try:
                    name = stock.get_index_ticker_name(ticker)
                except Exception:
                    continue

                if not is_volatility_index_name(str(name)):
                    continue

                start = ymd(parse_ymd(end) - dt.timedelta(days=14))
                df = stock.get_index_ohlcv_by_date(start, end, ticker)
                if df.empty or "종가" not in df.columns:
                    continue

                latest = df.dropna(subset=["종가"]).tail(1)
                if latest.empty:
                    continue

                latest_date = pd.to_datetime(latest.index[0]).strftime("%Y-%m-%d")
                result = volatility_result(str(name), latest_date, latest.iloc[0]["종가"], ticker)
                if result:
                    print(f"KOSPI 200 volatility index: {ticker} {name} {latest_date} {result['value']}")
                    return result
    except Exception as error:
        print(f"KOSPI 200 volatility index fetch failed: {error}")

    news_volatility = fetch_kospi_volatility_from_news()
    if news_volatility:
        return news_volatility

    print("KOSPI 200 volatility index unavailable.")
    return None


def collect(start: str, end: str) -> pd.DataFrame:
    print(f"Collecting KOSPI sentiment data: {start} ~ {end}")
    print(f"KRX_ID configured: {bool(os.getenv('KRX_ID'))}")
    print(f"KRX_PW configured: {bool(os.getenv('KRX_PW'))}")

    index_df = fetch_kospi_close_from_yahoo(start, end)
    print(f"KOSPI index rows: {len(index_df)}")

    flow_df = fetch_investor_flow_chunked(start, end)
    if flow_df.empty:
        flow_df = fetch_investor_flow_daily_from_investor_api(index_df.index)
    print(f"KOSPI investor flow rows: {len(flow_df)}")

    if flow_df.empty:
        login_hint = " Check KRX_ID/KRX_PW GitHub Secrets." if not os.getenv("KRX_ID") else ""
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
    kospi200_volatility = fetch_kospi200_volatility(args.end)

    now_kst = dt.datetime.now(KST)
    meta = {
        "generatedAt": now_kst.isoformat(timespec="seconds"),
        "timezone": "Asia/Seoul",
        "source": "Yahoo Finance ^KS11 + pykrx KRX investor flow",
        "startDate": str(df.iloc[0]["date"]),
        "lastDataDate": str(df.iloc[-1]["date"]),
        "rowCount": int(len(df)),
        "kospi200Volatility": kospi200_volatility,
    }
    meta_out.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {len(df)} rows to {out}. Last date: {df.iloc[-1]['date']}")
    print(f"Wrote metadata to {meta_out}. Generated at: {meta['generatedAt']}")


if __name__ == "__main__":
    main()
