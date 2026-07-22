"""Maintain a sourced KOSPI forward-PER CSV history without fabricating values.

The scheduled job checks public Google News RSS results once a week. A row is
added only when a result explicitly contains KOSPI, forward/12-month PER and a
plausible numerical value. If that test is not met, the existing CSV remains
unchanged. The website reads the latest two rows only; the CSV is the archive.
"""
from __future__ import annotations

import csv
import datetime as dt
import html
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path

KST = dt.timezone(dt.timedelta(hours=9))
OUT = Path("docs/data/kospi-forward-per-history.csv")
FIELDS = ["date", "value", "source_title", "source_url", "source_name", "note"]
QUERY = "KOSPI 12-month forward PER"
RSS = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
    {"q": QUERY, "hl": "en", "gl": "US", "ceid": "US:en"}
)


def load_rows() -> list[dict[str, str]]:
    if not OUT.exists():
        return []
    with OUT.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def candidate() -> dict[str, str] | None:
    request = urllib.request.Request(RSS, headers={"User-Agent": "WIPLabs-ForwardPER/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        root = ET.fromstring(response.read())

    for item in root.findall("./channel/item"):
        title = html.unescape(item.findtext("title") or "").strip()
        description = html.unescape(item.findtext("description") or "").strip()
        text = f"{title} {description}".lower()
        if "kospi" not in text or "per" not in text:
            continue
        if "forward" not in text and "12-month" not in text and "12 month" not in text:
            continue
        values = [float(value) for value in re.findall(r"(?<![0-9])(\d{1,2}(?:\.\d+)?)\s*(?:x|times)\b", text)]
        value = next((item for item in values if 3 <= item <= 30), None)
        if value is None:
            continue
        pub = item.findtext("pubDate") or ""
        try:
            date = parsedate_to_datetime(pub).astimezone(KST).date().isoformat()
        except (TypeError, ValueError):
            date = dt.datetime.now(KST).date().isoformat()
        source = item.find("source")
        return {
            "date": date,
            "value": f"{value:g}",
            "source_title": title,
            "source_url": (item.findtext("link") or "").strip(),
            "source_name": (source.text or "Google News RSS") if source is not None else "Google News RSS",
            "note": "Weekly public-reference check; added only after an explicit KOSPI forward-PER match.",
        }
    return None


def main() -> None:
    rows = load_rows()
    try:
        found = candidate()
    except Exception as error:
        print(f"Forward PER candidate search skipped: {error}")
        found = None

    duplicate = found and any(
        row.get("source_url") == found["source_url"]
        or (row.get("date") == found["date"] and row.get("value") == found["value"])
        for row in rows
    )
    if found and not duplicate:
        rows.append(found)
        print(f"Added forward PER reference: {found['date']} {found['value']}x")
    else:
        print("No explicit new forward-PER reference found; retained the CSV archive.")

    rows.sort(key=lambda row: row.get("date", ""))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows[-104:])


if __name__ == "__main__":
    main()
