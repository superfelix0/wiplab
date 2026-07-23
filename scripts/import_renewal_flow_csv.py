"""Seed F8 history from the user-provided KRX spot/futures CSV exports."""
from __future__ import annotations
import csv, json
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
ROOT = Path(__file__).resolve().parents[1]
SPOT = ROOT / "RENEWAL/kospi_spot_traders_flow.csv"
FUTURES = ROOT / "RENEWAL/kospi200_futures_traders_flow.csv"
OUT = ROOT / "docs/data/foreign-flow-pulse.json"

def rows(path: Path):
    with path.open(encoding="cp949", newline="") as f:
        for r in csv.DictReader(f):
            date = datetime.strptime(r["일자"], "%Y/%m/%d").date().isoformat()
            yield date, r

def main():
    spot = {d: r for d, r in rows(SPOT)}
    futures = {d: r for d, r in rows(FUTURES)}
    current = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    merged = {r["date"]: r for r in current.get("rows", [])}
    for date, r in spot.items():
        # KRX export is KRW millions; display/store spot flow as KRW trillions.
        entry = merged.get(date, {"date": date})
        entry.update({"foreignSpot": round(float(r["외국인 합계"]) / 1_000_000, 6), "individualSpot": round(float(r["개인"]) / 1_000_000, 6), "institutionSpot": round(float(r["기관 합계"]) / 1_000_000, 6)})
        if date in futures:
            entry["foreignFuturesContracts"] = int(float(futures[date]["외국인 합계"]))
        merged[date] = entry
    output = {**current, "ok": True, "generatedAt": datetime.now(KST).isoformat(timespec="seconds"), "lastDataDate": max(merged), "unit": "KRW trillion (spot); contracts (futures)", "isSample": False, "rows": [merged[d] for d in sorted(merged)[-260:]]}
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(spot)} spot rows and {len(futures)} futures rows")
if __name__ == "__main__": main()
