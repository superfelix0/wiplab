"""Append one transparent daily home-signal snapshot after Korean market data updates."""
from __future__ import annotations
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
OUT = Path("docs/data/signal-history.json")

def load(path: str) -> dict:
    target = Path(path)
    return json.loads(target.read_text(encoding="utf-8")) if target.exists() else {}

def main() -> None:
    market = load("docs/data/market-per.json").get("markets", {}).get("kospi200", {})
    meta = load("docs/data/kospi-sentiment-meta.json")
    risk = load("docs/data/bear-market-risk.json")
    flow = load("docs/data/foreign-flow-pulse.json")
    current = float(market.get("per", 0) or 0)
    average = float(market.get("historicalAveragePer", 0) or 0)
    vkospi = float(meta.get("kospi200Volatility", {}).get("value", 0) or 0)
    score = float(risk.get("summary", {}).get("totalScore", 0) or 0)
    if current > average and vkospi >= 25:
        label_ko, label_en, tone = "방향성 혼재·고변동성", "Mixed direction/high volatility", "neutral"
    elif score >= 6.5:
        label_ko, label_en, tone = "신중", "Cautious", "negative"
    else:
        label_ko, label_en, tone = "중립", "Neutral", "neutral"
    # The snapshot represents the collection date, not a component's stale as-of date.
    date = datetime.now(KST).date().isoformat()
    rows = load(str(OUT)).get("snapshots", [])
    snapshot = {"date": date, "labelKo": label_ko, "labelEn": label_en, "tone": tone, "riskScore": score, "vkospi": vkospi, "currentPer": current, "historicalAveragePer": average, "foreignFlowDate": flow.get("lastDataDate", "")}
    rows = [row for row in rows if row.get("date") != date] + [snapshot]
    rows = sorted(rows, key=lambda row: row.get("date", ""))[-30:]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"generatedAt": datetime.now(KST).isoformat(timespec="seconds"), "snapshots": rows}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__": main()
