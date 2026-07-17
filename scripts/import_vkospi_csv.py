from __future__ import annotations

import csv
import json
import shutil
import sys
from datetime import datetime, timedelta
from pathlib import Path


META_PATH = Path("docs/data/kospi-sentiment-meta.json")
SEED_PATH = Path("docs/data/vkospi-history.csv")


def parse_number(value: str) -> float | None:
    try:
        return float(str(value).replace(",", "").strip().strip('"'))
    except (TypeError, ValueError):
        return None


def parse_date(value: str) -> str | None:
    text = str(value).strip().strip('"')
    for fmt in ("%Y/%m/%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def read_history(path: Path) -> list[dict]:
    rows = []
    last_error = None
    for encoding in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            with path.open("r", encoding=encoding, newline="") as handle:
                reader = csv.DictReader(handle)
                rows = []
                for row in reader:
                    date = parse_date(row.get("일자") or row.get("date"))
                    value = parse_number(row.get("종가") or row.get("close"))
                    if date and value and value > 0:
                        rows.append({"date": date, "value": value})
            break
        except UnicodeDecodeError as error:
            last_error = error
            continue
    else:
        raise last_error or RuntimeError("Failed to decode CSV")

    deduped = {row["date"]: row for row in rows}
    return [deduped[key] for key in sorted(deduped)]


def recent_window(history: list[dict], days: int = 100) -> list[dict]:
    if not history:
        return []
    latest = datetime.fromisoformat(history[-1]["date"]).date()
    cutoff = latest - timedelta(days=days)
    return [row for row in history if datetime.fromisoformat(row["date"]).date() >= cutoff]


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/import_vkospi_csv.py <vkospi_csv_path>")

    source = Path(sys.argv[1])
    if not source.exists():
        raise FileNotFoundError(source)

    history = read_history(source)
    if not history:
        raise RuntimeError("No VKOSPI rows found")

    SEED_PATH.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, SEED_PATH)

    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    latest = history[-1]
    meta["kospi200Volatility"] = {
        **(meta.get("kospi200Volatility") or {}),
        "name": "KOSPI 200 Volatility Index (VKOSPI)",
        "ticker": "KRDRVFUVKI",
        "date": latest["date"],
        "value": latest["value"],
        "source": "user-provided KRX CSV",
        "history": recent_window(history),
    }
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(history)} VKOSPI rows. Latest: {latest['date']} {latest['value']}")


if __name__ == "__main__":
    main()
