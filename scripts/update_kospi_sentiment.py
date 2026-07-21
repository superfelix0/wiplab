"""Collect KOSPI close and individual net-buying data for WIP 3.

Output CSV schema:
date,close,indiv_krw

The script is designed for GitHub Actions. If the installed pykrx version
requires KRX login, set KRX_ID and KRX_PW as GitHub Actions secrets.
"""

from __future__ import annotations

import argparse
import csv
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
VKOSPI_SEED_CSV = Path("docs/data/vkospi-history.csv")
DEFAULT_HISTORY_DAYS = 620
DEFAULT_INCREMENTAL_LOOKBACK_DAYS = 0
MIN_SENTIMENT_ROWS = 120


def ymd(value: dt.date) -> str:
    return value.strftime("%Y%m%d")


def parse_args() -> argparse.Namespace:
    today = dt.datetime.now(KST).date()
    default_end = today

    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default=None, help="Start date as YYYYMMDD. If omitted, existing CSV is updated incrementally.")
    parser.add_argument(
        "--end",
        default=ymd(default_end),
        help="End date as YYYYMMDD. Defaults to the current KST date; non-trading dates are naturally skipped by the data join.",
    )
    parser.add_argument("--out", default="docs/data/kospi-sentiment.csv", help="Output CSV path")
    parser.add_argument("--meta-out", default="docs/data/kospi-sentiment-meta.json", help="Output metadata JSON path")
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=DEFAULT_INCREMENTAL_LOOKBACK_DAYS,
        help="When --start is omitted, refetch this many days before the last saved date. The default only overlaps the last saved date.",
    )
    parser.add_argument(
        "--full-refresh",
        action="store_true",
        help=f"Ignore the existing CSV and refetch the default {DEFAULT_HISTORY_DAYS}-day history.",
    )
    return parser.parse_args()


def parse_ymd(value: str) -> dt.date:
    return dt.datetime.strptime(value, "%Y%m%d").date()


def load_existing_sentiment(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame(columns=["date", "close", "indiv_krw"])

    try:
        df = pd.read_csv(path)
    except Exception as error:
        print(f"Existing KOSPI sentiment CSV skipped: {error}")
        return pd.DataFrame(columns=["date", "close", "indiv_krw"])

    required = {"date", "close", "indiv_krw"}
    if not required.issubset(df.columns):
        print(f"Existing KOSPI sentiment CSV skipped because columns are invalid: {list(df.columns)}")
        return pd.DataFrame(columns=["date", "close", "indiv_krw"])

    df = df[["date", "close", "indiv_krw"]].copy()
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.strftime("%Y-%m-%d")
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df["indiv_krw"] = pd.to_numeric(df["indiv_krw"], errors="coerce").round().astype("Int64")
    return df.dropna(subset=["date", "close", "indiv_krw"]).sort_values("date").reset_index(drop=True)


def resolve_collection_start(args: argparse.Namespace, existing: pd.DataFrame) -> str:
    end_date = parse_ymd(args.end)

    if args.start:
        return args.start

    if args.full_refresh or existing.empty:
        return ymd(end_date - dt.timedelta(days=DEFAULT_HISTORY_DAYS))

    last_existing = pd.to_datetime(existing["date"]).max().date()
    lookback_days = max(0, int(args.lookback_days))
    return ymd(last_existing - dt.timedelta(days=lookback_days))


def merge_sentiment_rows(existing: pd.DataFrame, latest: pd.DataFrame) -> pd.DataFrame:
    frames = [frame for frame in (existing, latest) if not frame.empty]
    if not frames:
        return pd.DataFrame(columns=["date", "close", "indiv_krw"])

    merged = pd.concat(frames, ignore_index=True)
    merged["date"] = pd.to_datetime(merged["date"], errors="coerce").dt.strftime("%Y-%m-%d")
    merged["close"] = pd.to_numeric(merged["close"], errors="coerce")
    merged["indiv_krw"] = pd.to_numeric(merged["indiv_krw"], errors="coerce").round().astype("Int64")
    merged = merged.dropna(subset=["date", "close", "indiv_krw"])
    merged = merged.sort_values("date").drop_duplicates(subset=["date"], keep="last")
    return merged[["date", "close", "indiv_krw"]].reset_index(drop=True)


def fetch_kospi_close_from_krx(start: str, end: str) -> pd.DataFrame:
    """Fetch KOSPI closes from the same KRX source used for investor flow.

    ``name_display=False`` is intentional. Some pykrx/KRX combinations return
    the OHLCV rows correctly but fail while looking up the display name for
    ticker 1001, which used to make the whole collection fail with a KeyError.
    """
    df = stock.get_index_ohlcv_by_date(start, end, "1001", name_display=False)
    if df.empty:
        raise RuntimeError("KOSPI index data is empty. KRX returned no ticker 1001 rows.")
    if "종가" not in df.columns:
        raise RuntimeError(f"KOSPI index data does not include 종가: {list(df.columns)}")

    close = df[["종가"]].rename(columns={"종가": "close"}).copy()
    close.index = pd.to_datetime(close.index)
    close["close"] = pd.to_numeric(close["close"], errors="coerce")
    close = close.dropna(subset=["close"]).sort_index()
    if close.empty:
        raise RuntimeError("KOSPI index data is empty after normalizing KRX close values.")

    close.attrs["source"] = "pykrx KRX index ticker 1001"
    return close


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
    df = df.set_index("date").sort_index()
    df.attrs["source"] = "Yahoo Finance ^KS11 fallback"
    return df


def fetch_kospi_close(start: str, end: str) -> pd.DataFrame:
    try:
        return fetch_kospi_close_from_krx(start, end)
    except Exception as error:
        print(f"KRX KOSPI close fetch failed; trying Yahoo fallback: {error}")
        return fetch_kospi_close_from_yahoo(start, end)


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


def fetch_vkospi_history_from_futures_table(end: str, start: str | None = None, days: int = 100) -> list[dict]:
    fetcher = get_krx_future_fetcher("dbms/MDC/STAT/standard/MDCSTAT12501")
    if fetcher is None:
        print("V-KOSPI history fetcher unavailable.")
        return []

    rows = []
    end_date = parse_ymd(end)
    start_date = parse_ymd(start) if start else end_date - dt.timedelta(days=days)
    if start_date > end_date:
        return []

    current_date = start_date
    while current_date <= end_date:
        date_str = ymd(current_date)
        try:
            df = fetcher.fetch(date_str, "KRDRVFUVKI")
        except Exception:
            current_date += dt.timedelta(days=1)
            continue

        if df.empty or "SPOT_PRC" not in df.columns:
            current_date += dt.timedelta(days=1)
            continue

        for _, row in df.iterrows():
            result = volatility_result("KOSPI 200 Volatility Index (VKOSPI)", pd.to_datetime(date_str).strftime("%Y-%m-%d"), row.get("SPOT_PRC"), "KRDRVFUVKI")
            if result:
                rows.append({
                    "date": result["date"],
                    "value": result["value"],
                })
                break
        current_date += dt.timedelta(days=1)

    deduped = {row["date"]: row for row in rows}
    history = [deduped[key] for key in sorted(deduped)]
    print(f"V-KOSPI history rows: {len(history)}")
    return history


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


def normalize_vkospi_history(rows: list[dict]) -> list[dict]:
    normalized = {}
    for row in rows or []:
        try:
            date = pd.to_datetime(row.get("date")).strftime("%Y-%m-%d")
            value = normalize_float(row.get("value"))
        except Exception:
            continue
        if value is None or value <= 0:
            continue
        normalized[date] = {"date": date, "value": value}
    return [normalized[key] for key in sorted(normalized)]


def load_existing_vkospi_history(meta_out: Path) -> list[dict]:
    if not meta_out.exists():
        return []
    try:
        meta = json.loads(meta_out.read_text(encoding="utf-8"))
    except Exception as error:
        print(f"Existing VKOSPI history skipped: {error}")
        return []
    return normalize_vkospi_history((meta.get("kospi200Volatility") or {}).get("history") or [])


def parse_seed_vkospi_history(path: Path = VKOSPI_SEED_CSV) -> list[dict]:
    if not path.exists():
        return []

    rows = []
    last_error = None
    for encoding in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            with path.open("r", encoding=encoding, newline="") as handle:
                reader = csv.DictReader(handle)
                rows = []
                for row in reader:
                    date = row.get("일자") or row.get("date")
                    value = row.get("종가") or row.get("close")
                    if date:
                        date = str(date).strip().strip('"').replace("/", "-")
                    rows.append({"date": date, "value": value})
            break
        except UnicodeDecodeError as error:
            last_error = error
            continue
        except Exception as error:
            print(f"Seed VKOSPI CSV skipped: {error}")
            return []
    else:
        print(f"Seed VKOSPI CSV skipped: {last_error}")
        return []

    return normalize_vkospi_history(rows)


def merge_vkospi_history(*groups: list[dict], latest: dict | None = None) -> list[dict]:
    merged = {}
    for group in groups:
        for row in normalize_vkospi_history(group):
            merged[row["date"]] = row

    if latest:
        latest_row = normalize_vkospi_history([{
            "date": latest.get("date"),
            "value": latest.get("value"),
        }])
        for row in latest_row:
            merged[row["date"]] = row

    return [merged[key] for key in sorted(merged)]


def collect(start: str, end: str) -> pd.DataFrame:
    print(f"Collecting KOSPI sentiment data: {start} ~ {end}")
    print(f"KRX_ID configured: {bool(os.getenv('KRX_ID'))}")
    print(f"KRX_PW configured: {bool(os.getenv('KRX_PW'))}")

    index_df = fetch_kospi_close(start, end)
    print(f"KOSPI index rows: {len(index_df)} ({index_df.attrs.get('source', 'unknown source')})")

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

    index_latest = pd.to_datetime(index_df.index).max().date()
    flow_latest = pd.to_datetime(flow_df.index).max().date()
    merged_latest = pd.to_datetime(merged["date"]).max().date() if not merged.empty else None
    print(f"Latest source dates - index: {index_latest}, investor flow: {flow_latest}, joined: {merged_latest}")

    # Do not report a successful refresh when one source has newer trading-day
    # data that was silently discarded by the inner join.
    if merged_latest is None or merged_latest < flow_latest:
        raise RuntimeError(
            "KOSPI sentiment data did not reach the latest investor-flow date: "
            f"index={index_latest}, flow={flow_latest}, joined={merged_latest}."
        )

    if len(merged) < MIN_SENTIMENT_ROWS:
        print(f"Collected only {len(merged)} rows in this run. The existing CSV will be used to keep enough history.")

    return merged


def main() -> None:
    args = parse_args()
    out = Path(args.out)
    meta_out = Path(args.meta_out)
    out.parent.mkdir(parents=True, exist_ok=True)
    meta_out.parent.mkdir(parents=True, exist_ok=True)

    existing_df = load_existing_sentiment(out)
    collection_start = resolve_collection_start(args, existing_df)
    if args.start:
        print(f"Manual start date supplied. Collecting requested range: {collection_start} ~ {args.end}")
    elif args.full_refresh or existing_df.empty:
        print(f"No existing CSV or full refresh requested. Collecting initial history: {collection_start} ~ {args.end}")
    else:
        print(
            f"Existing CSV rows: {len(existing_df)}. Last saved date: {existing_df.iloc[-1]['date']}. "
            f"Incremental collection range: {collection_start} ~ {args.end}"
        )

    latest_df = collect(collection_start, args.end)
    df = merge_sentiment_rows(existing_df, latest_df)
    if len(df) < MIN_SENTIMENT_ROWS:
        raise RuntimeError(f"Not enough cumulative observations after merge: {len(df)}")

    df.to_csv(out, index=False, encoding="utf-8")
    kospi200_volatility = fetch_kospi200_volatility(args.end)
    existing_vkospi_history = load_existing_vkospi_history(meta_out)
    if existing_vkospi_history:
        last_vkospi_date = parse_ymd(existing_vkospi_history[-1]["date"].replace("-", ""))
        vkospi_start = ymd(last_vkospi_date + dt.timedelta(days=1))
        print(f"Incremental V-KOSPI collection range: {vkospi_start} ~ {args.end}")
    else:
        vkospi_start = None
        print("No V-KOSPI history found. Collecting the initial history window.")
    vkospi_history = fetch_vkospi_history_from_futures_table(args.end, start=vkospi_start)
    seed_vkospi_history = parse_seed_vkospi_history()
    merged_vkospi_history = merge_vkospi_history(
        seed_vkospi_history,
        existing_vkospi_history,
        vkospi_history,
        latest=kospi200_volatility,
    )
    if kospi200_volatility and merged_vkospi_history:
        kospi200_volatility["history"] = merged_vkospi_history

    now_kst = dt.datetime.now(KST)
    meta = {
        "generatedAt": now_kst.isoformat(timespec="seconds"),
        "timezone": "Asia/Seoul",
        "source": "pykrx KRX KOSPI index + investor flow (Yahoo Finance ^KS11 index fallback)",
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
